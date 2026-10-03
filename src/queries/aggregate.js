'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    formatDecimal,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
  },
  accountPrefixFilter: { accountPrefixFilter },
  apiOptions: { parseOptions },
  valuationRates: { queryValuationRates },
  valuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1)).default([]),
    dateBasis: z.enum(['posting', 'transaction'], { error: 'Invalid dateBasis' }).default('posting'),
    from: z.iso.date({ error: 'Invalid --from date' }).optional(),
    includeTotal: z.boolean({ error: 'must be a boolean' }).default(false),
    inValuationCommodity: z.boolean({ error: 'must be a boolean' }).default(false),
    invert: z.boolean({ error: 'must be a boolean' }).default(false),
    to: z.iso.date({ error: 'Invalid --to date' }).optional(),
    withValuationValue: z.boolean({ error: 'must be a boolean' }).default(false),
  }).superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: 'custom',
        message: `--from date ${input.from} is after --to date ${input.to}`,
        path: ['from'],
      });
    }
    if (input.inValuationCommodity && input.withValuationValue) {
      context.addIssue({
        code: 'custom',
        message: 'inValuationCommodity and withValuationValue cannot be used together',
      });
    }
    if (input.includeTotal && !input.inValuationCommodity) {
      context.addIssue({
        code: 'custom',
        message: 'includeTotal requires inValuationCommodity',
      });
    }
  });

  function reportFilter(options) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    const clauses = [
      `${dateExpression} >= COALESCE(?, '0000-00-00')`,
      `${dateExpression} <= COALESCE(?, '9999-12-31')`,
    ];
    const parameters = [options.from ?? null, options.to ?? null];
    if (options.accounts.length > 0) {
      const accountFilter = accountPrefixFilter('p.account', options.accounts);
      clauses.push(accountFilter.sql);
      parameters.push(...accountFilter.parameters);
    }
    return {
      sql: `WHERE ${clauses.join('\n      AND ')}`,
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
    const valuationCommodity = valuationCommodityFromDatabase(database);
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

  function queryAggregate(database, options, { valuationPriceCache }) {
    const reportOptions = parseOptions(optionsSchema, options, 'aggregateReport');
    const commodityTotals = queryCommodityTotals(database, reportOptions);
    const rows = reportOptions.inValuationCommodity
      ? queryValuationTotals(database, reportOptions, commodityTotals, valuationPriceCache)
      : reportOptions.withValuationValue
        ? withValuationValues(database, reportOptions, commodityTotals, valuationPriceCache)
        : commodityTotals;
    return transformRows(rows, reportOptions);
  }

  return { name: 'aggregateReport', inputSchema: optionsSchema, execute: queryAggregate };
};
