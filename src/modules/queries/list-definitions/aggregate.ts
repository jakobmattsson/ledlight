'use strict';

import type { AggregateOptions, AggregateRow } from '../../../public-api';

type ParsedOptions = AggregateOptions & { accounts: string[] };
type Database = {
  prepare(sql: string): { all(...parameters: unknown[]): unknown[] };
  function(name: string, options: { deterministic: boolean }, callback: (commodity: string) => string | undefined): void;
};
type Cache = Map<symbol, (commodity: string, throughDate: string) => string>;


module.exports = ({
  apiOptions: { accounts, booleanOption, dateBasis, dateRange, valuation, validateDateRange, parseOptions },
  core: {
    appendTotal,
  },
  numeric: {
    decimal: {
      formatDecimal,
      multiplyDecimals,
      negateDecimal,
      parseDecimal,
    },
  },
  accountFilter: { accountFilter },
  costValuation: { validateCostValuation, costValueSql },
  valuationRates: { queryValuationRates },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  external: {
    zod: { z }
  },
}: any) => {

  const optionsSchema = z.strictObject({
    accounts,
    dateBasis,
    valuation,
    ...dateRange,
    groupBy: z.enum(['account', 'commodity'], { error: 'Invalid groupBy' }).default('account'),
    includeTotal: booleanOption,
    denominate: booleanOption,
    invert: booleanOption,
    withValuationValue: booleanOption,
  }).superRefine(validateDateRange).superRefine((input: ParsedOptions, context: { addIssue(issue: { code: 'custom'; message: string }): void }) => {
    if (input.denominate && input.withValuationValue) {
      context.addIssue({
        code: 'custom',
        message: 'denominate and withValuationValue cannot be used together',
      });
    }
    if (input.includeTotal && input.groupBy === 'commodity') {
      context.addIssue({
        code: 'custom',
        message: 'includeTotal cannot be used when grouping by commodity',
      });
    }
  });

  function reportFilter(options: ParsedOptions) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.posting_date';
    const clauses = [];
    const parameters = [];
    if (options.from) {
      clauses.push(`${dateExpression} >= ?`);
      parameters.push(options.from);
    }
    if (options.to) {
      clauses.push(`${dateExpression} <= ?`);
      parameters.push(options.to);
    }
    if (options.accounts.length > 0) {
      const filter = accountFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    return {
      sql: clauses.length === 0 ? '' : `WHERE ${clauses.join('\n      AND ')}`,
      parameters,
    };
  }

  function queryCommodityTotals(database: Database, options: ParsedOptions) {
    const filter = reportFilter(options);
    const costColumn = options.withValuationValue && options.valuation === 'cost'
      ? `, decimal_sum(${costValueSql}) AS valuationValue`
      : '';
    const accountColumn = options.groupBy === 'account' ? 'p.account,\n      ' : '';
    const groupBy = options.groupBy === 'account'
      ? 'p.account, r.amount_commodity'
      : 'r.amount_commodity';
    const nonZero = options.groupBy === 'account'
      ? "\n    HAVING decimal_cmp(decimal_sum(r.amount_quantity), '0') != 0"
      : '';
    const orderBy = options.groupBy === 'account' ? 'p.account, r.amount_commodity' : 'r.amount_commodity';
    return database.prepare(`
    SELECT
      ${accountColumn}r.amount_commodity AS commodity,
      decimal_sum(r.amount_quantity) AS quantity${costColumn}
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY ${groupBy}${nonZero}
    ORDER BY ${orderBy}
  `).all(...filter.parameters) as AggregateRow[];
  }

  function queryValuationTotals(database: Database, options: ParsedOptions, commodityTotals: AggregateRow[], valuationPriceCache: Cache) {
    if (options.valuation === 'market') {
      const rates = queryValuationRates(
        database,
        options.to,
        new Set(commodityTotals.map((row: AggregateRow) => row.commodity)),
        valuationPriceCache,
      );
      database.function('valuation_rate', { deterministic: true }, (commodity: string) => rates.get(commodity));
    }
    const valueSql = options.valuation === 'cost'
      ? costValueSql
      : 'decimal_mul(r.amount_quantity, valuation_rate(r.amount_commodity))';
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const filter = reportFilter(options);
    const accountColumn = options.groupBy === 'account' ? 'p.account,\n      ' : '';
    const groupBy = options.groupBy === 'account' ? 'p.account' : '1';
    const nonZero = options.groupBy === 'account'
      ? `
    HAVING decimal_cmp(
      decimal_sum(${valueSql}),
      '0'
    ) != 0`
      : '';
    const orderBy = options.groupBy === 'account' ? 'p.account' : '1';
    return database.prepare(`
    SELECT
      ${accountColumn}? AS commodity,
      decimal_sum(${valueSql}) AS quantity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    JOIN transactions AS t ON t.entry_id = p.transaction_id
    ${filter.sql}
    GROUP BY ${groupBy}${nonZero}
    ORDER BY ${orderBy}
  `).all(valuationCommodity, ...filter.parameters) as AggregateRow[];
  }

  function withValuationValues(database: Database, options: ParsedOptions, commodityTotals: AggregateRow[], valuationPriceCache: Cache) {
    if (options.valuation === 'cost') return commodityTotals;
    const rates = queryValuationRates(
      database,
      options.to,
      new Set(commodityTotals.map((row: AggregateRow) => row.commodity)),
      valuationPriceCache,
    );
    return commodityTotals.map((row: AggregateRow) => ({
      ...row,
      valuationValue: formatDecimal(multiplyDecimals(
        parseDecimal(row.quantity),
        parseDecimal(rates.get(row.commodity)),
      )),
    }));
  }

  function transformRows(rows: AggregateRow[], options: ParsedOptions) {
    const transformed = options.invert
      ? rows.map((row: AggregateRow) => ({
        ...row,
        quantity: formatDecimal(negateDecimal(parseDecimal(row.quantity))),
        ...(row.valuationValue === undefined ? {} : {
          valuationValue: formatDecimal(negateDecimal(parseDecimal(row.valuationValue))),
        }),
      }))
      : rows;
    return options.includeTotal ? appendTotal(transformed) : transformed;
  }

  function queryAggregate(database: Database, options: AggregateOptions, { valuationPriceCache }: { valuationPriceCache: Cache }) {
    const reportOptions = parseOptions(optionsSchema, options, 'aggregate') as ParsedOptions;
    if (reportOptions.valuation === 'cost' &&
        (reportOptions.denominate || reportOptions.withValuationValue)) {
      validateCostValuation(database, reportFilter(reportOptions));
    }
    const commodityTotals = queryCommodityTotals(database, reportOptions);
    const rows = reportOptions.denominate
      ? queryValuationTotals(database, reportOptions, commodityTotals, valuationPriceCache)
      : reportOptions.withValuationValue
        ? withValuationValues(database, reportOptions, commodityTotals, valuationPriceCache)
        : commodityTotals;
    return transformRows(rows, reportOptions);
  }

  return { inputSchema: optionsSchema, execute: queryAggregate };
};
