'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    formatDecimal,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
  },
  accountFilter: { accountFilter },
  apiOptions: { accounts, booleanOption, dateBasis, dateRange, validateDateRange, parseOptions },
  valuationRates: { queryValuationRates },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts,
    dateBasis,
    ...dateRange,
    groupBy: z.enum(['account', 'commodity'], { error: 'Invalid groupBy' }).default('account'),
    includeTotal: booleanOption,
    inValuationCommodity: booleanOption,
    invert: booleanOption,
    withValuationValue: booleanOption,
  }).superRefine(validateDateRange).superRefine((input, context) => {
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
    if (input.includeTotal && input.groupBy === 'commodity') {
      context.addIssue({
        code: 'custom',
        message: 'includeTotal cannot be used when grouping by commodity',
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
      const filter = accountFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    return {
      sql: `WHERE ${clauses.join('\n      AND ')}`,
      parameters,
    };
  }

  function queryCommodityTotals(database, options) {
    const filter = reportFilter(options);
    const accountColumn = options.groupBy === 'account' ? 'p.account,\n      ' : '';
    const groupBy = options.groupBy === 'account'
      ? 'p.account, r.commodity'
      : 'r.commodity';
    const nonZero = options.groupBy === 'account'
      ? "\n    HAVING decimal_cmp(decimal_sum(r.quantity), '0') != 0"
      : '';
    const orderBy = options.groupBy === 'account' ? 'p.account, r.commodity' : 'r.commodity';
    return database.prepare(`
    SELECT
      ${accountColumn}r.commodity,
      decimal_sum(r.quantity) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY ${groupBy}${nonZero}
    ORDER BY ${orderBy}
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
    const accountColumn = options.groupBy === 'account' ? 'p.account,\n      ' : '';
    const groupBy = options.groupBy === 'account' ? 'p.account' : '1';
    const nonZero = options.groupBy === 'account'
      ? `
    HAVING decimal_cmp(
      decimal_sum(decimal_mul(r.quantity, valuation_rate(r.commodity))),
      '0'
    ) != 0`
      : '';
    const orderBy = options.groupBy === 'account' ? 'p.account' : '1';
    return database.prepare(`
    SELECT
      ${accountColumn}? AS commodity,
      decimal_sum(decimal_mul(r.quantity, valuation_rate(r.commodity))) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY ${groupBy}${nonZero}
    ORDER BY ${orderBy}
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
    const reportOptions = parseOptions(optionsSchema, options, 'aggregate');
    const commodityTotals = queryCommodityTotals(database, reportOptions);
    const rows = reportOptions.inValuationCommodity
      ? queryValuationTotals(database, reportOptions, commodityTotals, valuationPriceCache)
      : reportOptions.withValuationValue
        ? withValuationValues(database, reportOptions, commodityTotals, valuationPriceCache)
        : commodityTotals;
    return transformRows(rows, reportOptions);
  }

  return { name: 'aggregate', inputSchema: optionsSchema, execute: queryAggregate };
};
