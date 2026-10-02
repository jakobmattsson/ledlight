'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: {
    addDecimals,
    formatDecimal,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
    registerDecimalFunctions,
  },
  accountPrefixFilter: { accountPrefixFilter },
  valuationRates: { queryValuationRates },
  valuationCommodity: { fromDatabase },
}) => {

  function assertDate(value, optionName) {
    if (value === undefined) return;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      throw new Error(`Invalid ${optionName} date: ${JSON.stringify(value)}; expected YYYY-MM-DD`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Invalid ${optionName} date: ${JSON.stringify(value)}`);
    }
  }

  function normalizeOptions(options) {
    const normalized = {
      from: options.from,
      to: options.to,
      accounts: options.accounts ?? [],
      dateBasis: options.dateBasis ?? 'posting',
      inValuationCommodity: options.inValuationCommodity === true,
      includeTotal: options.includeTotal === true,
      invert: options.invert === true,
      withValuationValue: options.withValuationValue === true,
    };
    assertDate(normalized.from, '--from');
    assertDate(normalized.to, '--to');
    if (normalized.from && normalized.to && normalized.from > normalized.to) {
      throw new Error(`--from date ${normalized.from} is after --to date ${normalized.to}`);
    }
    if (!Array.isArray(normalized.accounts) || normalized.accounts.some((prefix) => typeof prefix !== 'string' || prefix.length === 0)) {
      throw new Error('accounts must be an array of non-empty prefixes');
    }
    if (normalized.dateBasis !== 'posting' && normalized.dateBasis !== 'transaction') {
      throw new Error(`Invalid dateBasis: ${JSON.stringify(normalized.dateBasis)}; expected posting or transaction`);
    }
    if (normalized.inValuationCommodity && normalized.withValuationValue) {
      throw new Error('inValuationCommodity and withValuationValue cannot be used together');
    }
    if (normalized.includeTotal && !normalized.inValuationCommodity) {
      throw new Error('includeTotal requires inValuationCommodity');
    }
    return normalized;
  }

  function reportFilter(options) {
    const clauses = [];
    const parameters = [];
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    if (options.from) {
      clauses.push(`${dateExpression} >= ?`);
      parameters.push(options.from);
    }
    if (options.to) {
      clauses.push(`${dateExpression} <= ?`);
      parameters.push(options.to);
    }
    if (options.accounts.length > 0) {
      const accountFilter = accountPrefixFilter('p.account', options.accounts);
      clauses.push(accountFilter.sql);
      parameters.push(...accountFilter.parameters);
    }
    return {
      sql: clauses.length > 0 ? `WHERE ${clauses.join('\n      AND ')}` : '',
      parameters,
    };
  }

  function queryCommodityTotals(database, options) {
    const filter = reportFilter(options);
    return database.prepare(`
    SELECT
      p.account,
      r.commodity,
      decimal_sum(r.quantity) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY p.account, r.commodity
    HAVING decimal_cmp(decimal_sum(r.quantity), '0') != 0
    ORDER BY p.account, r.commodity
  `).all(...filter.parameters);
  }

  function queryValuationTotals(database, options, commodityTotals, valuationPriceCache) {
    const rates = queryValuationRates(
      database,
      options.to,
      new Set(commodityTotals.map((row) => row.commodity)),
      valuationPriceCache,
    );
    const valuationCommodity = fromDatabase(database);
    database.function('valuation_rate', { deterministic: true }, (commodity) => rates.get(commodity));
    const filter = reportFilter(options);
    return database.prepare(`
    SELECT
      p.account,
      ? AS commodity,
      decimal_sum(decimal_mul(r.quantity, valuation_rate(r.commodity))) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY p.account
    HAVING decimal_cmp(
      decimal_sum(decimal_mul(r.quantity, valuation_rate(r.commodity))),
      '0'
    ) != 0
    ORDER BY p.account
  `).all(valuationCommodity, ...filter.parameters);
  }

  function withValuationValues(database, options, commodityTotals, valuationPriceCache) {
    const rates = queryValuationRates(
      database,
      options.to,
      new Set(commodityTotals.map((row) => row.commodity)),
      valuationPriceCache,
    );
    return commodityTotals.map((row) => ({
      ...row,
      valuationValue: formatDecimal(multiplyDecimals(
        parseDecimal(row.quantity),
        parseDecimal(rates.get(row.commodity)),
      )),
    }));
  }

  function transformRows(rows, options) {
    const transformed = options.invert
      ? rows.map((row) => ({
        ...row,
        quantity: formatDecimal(negateDecimal(parseDecimal(row.quantity))),
        ...(row.valuationValue === undefined ? {} : {
          valuationValue: formatDecimal(negateDecimal(parseDecimal(row.valuationValue))),
        }),
      }))
      : rows;
    if (!options.includeTotal || transformed.length === 0) return transformed;
    const total = transformed.reduce(
      (sum, row) => addDecimals(sum, parseDecimal(row.quantity)),
      parseDecimal('0'),
    );
    return [
      ...transformed,
      {
        account: 'Total',
        commodity: transformed[0].commodity,
        isTotal: true,
        quantity: formatDecimal(total),
      },
    ];
  }

  function queryAggregateReport(databasePath, options, { valuationPriceCache }) {
    const normalizedOptions = normalizeOptions(options);
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      registerDecimalFunctions(database);
      const commodityTotals = queryCommodityTotals(database, normalizedOptions);
      const rows = normalizedOptions.inValuationCommodity
        ? queryValuationTotals(database, normalizedOptions, commodityTotals, valuationPriceCache)
        : normalizedOptions.withValuationValue
          ? withValuationValues(database, normalizedOptions, commodityTotals, valuationPriceCache)
          : commodityTotals;
      return transformRows(rows, normalizedOptions);
    } finally {
      database.close();
    }
  }

  return { queryAggregateReport };
};
