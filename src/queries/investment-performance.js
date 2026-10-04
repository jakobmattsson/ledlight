'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  publicErrors: { createError, errorCodes },
  apiOptions: { parseOptions },
  investmentReturns: { calculatePerformance },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const uniqueStringList = z.array(z.string().min(1))
    .default([])
    .transform((values) => [...new Set(values)]);
  const optionsSchema = z.strictObject({
    accounts: uniqueStringList,
    commodities: uniqueStringList,
    excludeCommodities: uniqueStringList,
    from: z.iso.date({ error: 'Invalid --from date' }).optional(),
    to: z.iso.date({ error: 'Invalid --to date' }).optional(),
  }).superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: 'custom',
        message: `--from date ${input.from} is after --to date ${input.to}`,
        path: ['from'],
      });
    }
    if (input.commodities.some((commodity) => input.excludeCommodities.includes(commodity))) {
      context.addIssue({
        code: 'custom',
        message: 'A commodity cannot be both included and excluded',
      });
    }
  });

  function selectedCommodities(database, options) {
    if (options.commodities.length > 0) return options.commodities;
    const clauses = [];
    const parameters = [];
    if (options.accounts.length > 0) {
      const filter = accountFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    if (options.excludeCommodities.length > 0) {
      clauses.push(`r.commodity NOT IN (${options.excludeCommodities.map(() => '?').join(', ')})`);
      parameters.push(...options.excludeCommodities);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join('\n      AND ')}` : '';
    return database.prepare(`
    SELECT DISTINCT r.commodity
    FROM resolved_posting_amounts AS r
    JOIN postings AS p ON p.id = r.posting_id
    ${where}
    ORDER BY r.commodity
  `).all(...parameters).map((row) => row.commodity);
  }

  function selectionFilter(options, commodities, alias) {
    const clauses = [`${alias}.commodity IN (${commodities.map(() => '?').join(', ')})`];
    const parameters = [...commodities];
    if (options.accounts.length > 0) {
      const filter = accountFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    return { sql: clauses.join('\n          AND '), parameters };
  }

  function queryDailyValues(database, options, commodities, valuationCommodity) {
    const filter = selectionFilter(options, commodities, 'r');
    const reportEnd = `SELECT MIN(value, COALESCE(?, value)) AS value
      FROM (
        SELECT MAX(date) AS value FROM (
          SELECT MAX(p.report_date) AS date
          FROM resolved_posting_amounts AS r
          JOIN postings AS p ON p.id = r.posting_id
          JOIN transactions AS t ON t.entry_id = p.transaction_id
          WHERE ${filter.sql}
          UNION ALL
          SELECT MAX(date) AS date FROM prices
        )
      )`;
    const parameters = [
      ...filter.parameters,
      ...filter.parameters,
      options.to ?? null,
    ];
    return database.prepare(`
    WITH RECURSIVE
      selected_changes AS (
        SELECT p.report_date AS date, r.commodity, decimal_sum(r.quantity) AS quantity
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        WHERE ${filter.sql}
        GROUP BY p.report_date, r.commodity
      ),
      commodity_bounds AS (
        SELECT commodity, MIN(date) AS start_date
        FROM selected_changes
        GROUP BY commodity
      ),
      report_end(value) AS MATERIALIZED (
        ${reportEnd}
      ),
      positions(commodity, date, quantity) AS (
        SELECT bounds.commodity, bounds.start_date, COALESCE(changes.quantity, '0')
        FROM commodity_bounds AS bounds
        JOIN report_end ON bounds.start_date <= report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = bounds.commodity AND changes.date = bounds.start_date
        UNION ALL
        SELECT positions.commodity, date(positions.date, '+1 day'),
          decimal_add(positions.quantity, COALESCE(changes.quantity, '0'))
        FROM positions
        JOIN report_end ON positions.date < report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = positions.commodity
          AND changes.date = date(positions.date, '+1 day')
      )
    SELECT positions.date,
      decimal_sum(decimal_mul(positions.quantity, valuation_prices.rate)) AS value,
      MIN(CASE WHEN valuation_prices.rate IS NULL AND decimal_cmp(positions.quantity, '0') != 0
        THEN positions.commodity END) AS missing_commodity
    FROM positions
    LEFT JOIN valuation_prices
      ON valuation_prices.commodity = positions.commodity AND valuation_prices.date = positions.date
    GROUP BY positions.date
    ORDER BY positions.date
  `).all(...parameters).map((row) => {
      if (row.missing_commodity) {
        throw createError(errorCodes.MISSING_VALUATION_DATA, `No price for ${row.missing_commodity} on or before ${row.date} can convert it to ${valuationCommodity}`);
      }
      return { date: row.date, value: Number(row.value) };
    });
  }

  function queryDailyFlows(database, options, commodities, valuationCommodity) {
    const accountClauses = [];
    const accountParameters = [];
    if (options.accounts.length > 0) {
      const filter = accountFilter('p.account', options.accounts);
      accountClauses.push(filter.sql);
      accountParameters.push(...filter.parameters);
    }
    const accountWhere = accountClauses.length > 0 ? `AND ${accountClauses.join(' AND ')}` : '';
    const parameters = [...commodities, ...commodities, ...accountParameters];
    const rows = database.prepare(`
    WITH transaction_values AS (
      SELECT t.entry_id, p.report_date AS date, p.account,
        decimal_sum(CASE WHEN r.commodity IN (${commodities.map(() => '?').join(', ')})
          THEN decimal_mul(r.quantity, valuation_prices.rate) ELSE '0' END) AS selected_value,
        decimal_sum(CASE WHEN r.commodity NOT IN (${commodities.map(() => '?').join(', ')})
          THEN decimal_mul(r.quantity, valuation_prices.rate) ELSE '0' END) AS unselected_value,
        MIN(CASE WHEN valuation_prices.rate IS NULL AND decimal_cmp(r.quantity, '0') != 0
          THEN r.commodity END) AS missing_commodity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      LEFT JOIN valuation_prices ON valuation_prices.commodity = r.commodity AND valuation_prices.date = p.report_date
      WHERE 1 = 1 ${accountWhere}
      GROUP BY t.entry_id, p.report_date, p.account
    )
    SELECT date,
      decimal_sum(CASE
        WHEN decimal_cmp(selected_value, '0') = 0 THEN '0'
        WHEN decimal_cmp(unselected_value, '0') != 0 THEN decimal_mul(unselected_value, '-1')
        ELSE selected_value
      END) AS flow,
      MIN(missing_commodity) AS missing_commodity
    FROM transaction_values
    WHERE decimal_cmp(selected_value, '0') != 0
    GROUP BY date
    ORDER BY date
  `).all(...parameters);
    return rows.map((row) => {
      if (row.missing_commodity) {
        throw createError(errorCodes.MISSING_VALUATION_DATA, `No price for ${row.missing_commodity} on or before ${row.date} can convert a cash flow to ${valuationCommodity}`);
      }
      return { date: row.date, flow: Number(row.flow) };
    });
  }

  function queryInvestmentPerformance(database, options, _caches) {
    const reportOptions = parseOptions(optionsSchema, options, 'investmentPerformance');
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const commodities = selectedCommodities(database, reportOptions);
    if (commodities.length === 0) return calculatePerformance([], [], reportOptions, [], valuationCommodity);
    const values = queryDailyValues(database, { ...reportOptions, from: undefined }, commodities, valuationCommodity);
    const flows = queryDailyFlows(database, reportOptions, commodities, valuationCommodity);
    return calculatePerformance(values, flows, reportOptions, commodities, valuationCommodity);
  }

  return {
    name: 'investmentPerformance',
    inputSchema: optionsSchema,
    execute: queryInvestmentPerformance,
  };
};
