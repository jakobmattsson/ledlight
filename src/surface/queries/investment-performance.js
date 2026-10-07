'use strict';

module.exports = ({
  accountFilter: { accountFilter, accountMatches },
  publicErrors: { createError, errorCodes },
  apiOptions: { accounts, dateRange, stringList, validateDateRange, parseOptions },
  investmentReturns: { calculatePerformance },
  investmentFlows: { calculateFlows },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts,
    commodities: stringList.default([]),
    excludeCommodities: stringList.default([]),
    ...dateRange,
  }).superRefine(validateDateRange).superRefine((input, context) => {
    if (input.commodities.some((commodity) => input.excludeCommodities.includes(commodity))) {
      context.addIssue({
        code: 'custom',
        message: 'A commodity cannot be both included and excluded',
      });
    }
  });

  function selectedCommodities(database, options) {
    if (options.commodities.length > 0) return options.commodities;
    const clauses = ["p.posting_date <= COALESCE(?, '9999-12-31')"];
    const parameters = [options.to ?? null];
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
          SELECT MAX(p.posting_date) AS date
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
      options.to ?? null,
      ...filter.parameters,
      options.from ?? null,
    ];
    return database.prepare(`
    WITH RECURSIVE
      selected_changes AS (
        SELECT p.posting_date AS date, r.commodity, decimal_sum(r.quantity) AS quantity
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        WHERE ${filter.sql}
        GROUP BY p.posting_date, r.commodity
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
    WHERE positions.date >= COALESCE(
      MIN(date(?, '-1 day'), (SELECT value FROM report_end)), '0000-00-00'
    )
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
    const filter = selectionFilter(options, commodities, 'r');
    const rows = database.prepare(`
      WITH selected_transactions AS (
        SELECT DISTINCT p.transaction_id
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        WHERE ${filter.sql}
          AND p.posting_date >= COALESCE(?, '0000-00-00')
          AND p.posting_date <= COALESCE(?, '9999-12-31')
      )
      SELECT p.*, r.quantity, r.commodity,
        market.rate AS market_rate, lot.rate AS lot_rate, price.rate AS cost_rate
      FROM postings AS p
      JOIN selected_transactions AS selected ON selected.transaction_id = p.transaction_id
      JOIN resolved_posting_amounts AS r ON r.posting_id = p.id
      LEFT JOIN valuation_prices AS market
        ON market.commodity = r.commodity AND market.date = p.posting_date
      LEFT JOIN valuation_prices AS lot
        ON lot.commodity = p.lot_cost_commodity AND lot.date = p.posting_date
      LEFT JOIN valuation_prices AS price
        ON price.commodity = p.cost_commodity AND price.date = p.posting_date
      ORDER BY p.transaction_id, p.position, r.position
    `).all(...filter.parameters, options.from ?? null, options.to ?? null);
    const selected = new Set(commodities);
    const annotation = (quantity, commodity, total) => quantity === null ? null : {
      amount: { quantity, commodity }, total: Boolean(total),
    };
    const postings = rows.map((row) => {
      const selectedAccount = options.accounts.length === 0 ||
        options.accounts.some((pattern) => accountMatches(row.account, pattern));
      return {
        transactionId: row.transaction_id,
        date: row.posting_date,
        account: row.account,
        amount: { quantity: row.quantity, commodity: row.commodity },
        lotCost: annotation(row.lot_cost_quantity, row.lot_cost_commodity, row.lot_cost_is_total),
        cost: annotation(row.cost_quantity, row.cost_commodity, row.cost_is_total),
        marketRate: row.market_rate,
        lotRate: row.lot_rate,
        costRate: row.cost_rate,
        selectedAccount,
        selected: selectedAccount && selected.has(row.commodity),
      };
    });
    return calculateFlows(postings, options, valuationCommodity);
  }

  function queryInvestmentPerformance(database, options, _caches) {
    const reportOptions = parseOptions(optionsSchema, options, 'investmentPerformance');
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const commodities = selectedCommodities(database, reportOptions);
    if (commodities.length === 0) return calculatePerformance([], [], reportOptions, [], valuationCommodity);
    const values = queryDailyValues(database, reportOptions, commodities, valuationCommodity);
    const flows = queryDailyFlows(database, reportOptions, commodities, valuationCommodity);
    return calculatePerformance(values, flows, reportOptions, commodities, valuationCommodity);
  }

  return {
    inputSchema: optionsSchema,
    execute: queryInvestmentPerformance,
  };
};
