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
  publicErrors: { createError, errorCodes },
  apiOptions: {
    assertDateInterval,
    booleanOption,
    dateBasis,
    parseOptions,
    stringList,
  },
  valuationRates: { queryValuationRates },
  valuationCommodity: { fromDatabase },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1)).optional(),
    dateBasis: z.enum(['posting', 'transaction'], { error: 'Invalid dateBasis' }).optional(),
    from: z.string().optional(),
    includeTotal: z.boolean({ error: 'must be a boolean' }).optional(),
    inValuationCommodity: z.boolean({ error: 'must be a boolean' }).optional(),
    invert: z.boolean({ error: 'must be a boolean' }).optional(),
    to: z.string().optional(),
    withValuationValue: z.boolean({ error: 'must be a boolean' }).optional(),
  });

  function normalizeOptions(options) {
    const input = parseOptions(optionsSchema, options, 'aggregateReport');
    const normalized = {
      from: input.from,
      to: input.to,
      accounts: stringList(input.accounts, 'accounts', false),
      dateBasis: dateBasis(input.dateBasis),
      inValuationCommodity: booleanOption(input, 'inValuationCommodity'),
      includeTotal: booleanOption(input, 'includeTotal'),
      invert: booleanOption(input, 'invert'),
      withValuationValue: booleanOption(input, 'withValuationValue'),
    };
    assertDateInterval(normalized.from, normalized.to);
    if (normalized.inValuationCommodity && normalized.withValuationValue) {
      throw createError(errorCodes.INVALID_API_INPUT, 'inValuationCommodity and withValuationValue cannot be used together', TypeError);
    }
    if (normalized.includeTotal && !normalized.inValuationCommodity) {
      throw createError(errorCodes.INVALID_API_INPUT, 'includeTotal requires inValuationCommodity', TypeError);
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

  return { optionsSchema, queryAggregateReport };
};
