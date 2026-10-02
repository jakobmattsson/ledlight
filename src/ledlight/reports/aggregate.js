'use strict';

module.exports = ({
  nodePath: path,
  betterSqlite3: Database,
  srcLedlightAccountingDecimal: {
    formatDecimal,
    multiplyDecimals,
    parseDecimal,
    registerDecimalFunctions,
  },
  srcLedlightReportsAccountPrefixFilter: { accountPrefixFilter },
  srcLedlightReportsSekRates: { querySekRates },
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
      inSek: options.inSek === true,
      withSekValue: options.withSekValue === true,
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
    if (normalized.inSek && normalized.withSekValue) {
      throw new Error('inSek and withSekValue cannot be used together');
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

  function querySekTotals(database, options, commodityTotals, sekPriceCache) {
    const rates = querySekRates(
      database,
      options.to,
      new Set(commodityTotals.map((row) => row.commodity)),
      sekPriceCache,
    );
    database.function('sek_rate', { deterministic: true }, (commodity) => rates.get(commodity));
    const filter = reportFilter(options);
    return database.prepare(`
    SELECT
      p.account,
      'SEK' AS commodity,
      decimal_sum(decimal_mul(r.quantity, sek_rate(r.commodity))) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY p.account
    HAVING decimal_cmp(
      decimal_sum(decimal_mul(r.quantity, sek_rate(r.commodity))),
      '0'
    ) != 0
    ORDER BY p.account
  `).all(...filter.parameters);
  }

  function withSekValues(database, options, commodityTotals, sekPriceCache) {
    const rates = querySekRates(
      database,
      options.to,
      new Set(commodityTotals.map((row) => row.commodity)),
      sekPriceCache,
    );
    return commodityTotals.map((row) => ({
      ...row,
      sekValue: formatDecimal(multiplyDecimals(
        parseDecimal(row.quantity),
        parseDecimal(rates.get(row.commodity)),
      )),
    }));
  }

  function queryAggregateReport(databasePath, options, { sekPriceCache }) {
    const normalizedOptions = normalizeOptions(options);
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      registerDecimalFunctions(database);
      const commodityTotals = queryCommodityTotals(database, normalizedOptions);
      if (normalizedOptions.inSek) {
        return querySekTotals(database, normalizedOptions, commodityTotals, sekPriceCache);
      }
      return normalizedOptions.withSekValue
        ? withSekValues(database, normalizedOptions, commodityTotals, sekPriceCache)
        : commodityTotals;
    } finally {
      database.close();
    }
  }

  return { queryAggregateReport };
};
