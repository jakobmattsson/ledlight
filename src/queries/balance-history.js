'use strict';

module.exports = ({
  decimal: {
    formatDecimal,
    negateDecimal,
    parseDecimal,
  },
  accountFilter: { accountFilter },
  publicErrors: { createError, errorCodes },
  apiOptions: { accounts, booleanOption, dateBasis, dateRange, valuation, validateDateRange, parseOptions },
  costValuation: { validateCostValuation, costValueSql },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts,
    dateBasis,
    valuation,
    ...dateRange,
    invert: booleanOption,
  }).superRefine(validateDateRange);

  function selectBalanceHistory(database, options, valuationCommodity) {
    const atCost = options.valuation === 'cost';
    const quantitySql = atCost ? costValueSql : 'r.quantity';
    const balanceSql = atCost
      ? 'positions.quantity'
      : 'decimal_mul(positions.quantity, valuation_prices.rate)';
    const priceJoin = atCost ? '' : `LEFT JOIN valuation_prices
          ON valuation_prices.commodity = positions.commodity
          AND valuation_prices.date = positions.date`;
    const missingCommoditySql = atCost ? 'NULL' : `MIN(CASE
            WHEN valuation_prices.rate IS NULL
              AND decimal_cmp(positions.quantity, '0') != 0
            THEN positions.commodity
          END)`;
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    const selectionFilter = options.accounts.length > 0
      ? accountFilter('p.account', options.accounts)
      : undefined;
    const parameters = [options.to ?? null, ...(selectionFilter?.parameters ?? [])];
    if (atCost) {
      validateCostValuation(database, {
        sql: `WHERE ${dateExpression} <= COALESCE(?, '9999-12-31')` +
          (selectionFilter ? ` AND ${selectionFilter.sql}` : ''),
        parameters,
      });
    }
    const postingWhere = `WHERE ${dateExpression} <= (SELECT value FROM report_end)` +
      (selectionFilter ? ` AND ${selectionFilter.sql}` : '');
    const latestSelectedDate = options.dateBasis === 'transaction'
      ? 'SELECT MAX(date) AS date FROM transactions'
      : 'SELECT MAX(report_date) AS date FROM postings';
    const reportEnd = `SELECT MIN(value, COALESCE(?, value)) AS value
      FROM (
        SELECT MAX(date) AS value FROM (
          ${latestSelectedDate}
          UNION ALL
          SELECT MAX(date) AS date FROM prices
        )
      )`;
    parameters.push(options.from ?? null, options.to ?? null);
    const rows = database.prepare(`
    WITH RECURSIVE
      report_end(value) AS MATERIALIZED (
        ${reportEnd}
      ),
      selected_changes AS (
        SELECT
          ${dateExpression} AS date,
          r.commodity,
          decimal_sum(${quantitySql}) AS quantity
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        ${postingWhere}
        GROUP BY ${dateExpression}, r.commodity
      ),
      commodity_bounds AS (
        SELECT commodity, MIN(date) AS start_date
        FROM selected_changes
        GROUP BY commodity
      ),
      positions(commodity, date, quantity) AS (
        SELECT
          bounds.commodity,
          bounds.start_date,
          COALESCE(changes.quantity, '0')
        FROM commodity_bounds AS bounds
        JOIN report_end ON bounds.start_date <= report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = bounds.commodity
          AND changes.date = bounds.start_date
        UNION ALL
        SELECT
          positions.commodity,
          date(positions.date, '+1 day'),
          decimal_add(positions.quantity, COALESCE(changes.quantity, '0'))
        FROM positions
        JOIN report_end ON positions.date < report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = positions.commodity
          AND changes.date = date(positions.date, '+1 day')
      ),
      daily_balances AS (
        SELECT
          positions.date,
          decimal_sum(${balanceSql}) AS balance,
          ${missingCommoditySql} AS missing_commodity
        FROM positions
        ${priceJoin}
        GROUP BY positions.date
      )
    SELECT date, balance AS amount, missing_commodity
    FROM daily_balances
    WHERE date >= COALESCE(?, '0000-00-00')
      AND date <= COALESCE(?, '9999-12-31')
    ORDER BY date
  `).all(...parameters);
    for (const row of rows) {
      if (row.missing_commodity) {
        throw createError(
          errorCodes.MISSING_VALUATION_DATA,
          `No price for ${row.missing_commodity} on or before ${row.date} can convert it to ${valuationCommodity}`,
        );
      }
    }
    return rows.map(({ date, amount }) => {
      const value = options.invert
        ? formatDecimal(negateDecimal(parseDecimal(amount)))
        : amount;
      return {
        date,
        amount: value,
        commodity: valuationCommodity,
      };
    });
  }

  function queryBalanceHistory(database, options, _caches) {
    const reportOptions = parseOptions(optionsSchema, options, 'balanceHistoryReport');
    return selectBalanceHistory(database, reportOptions, valuationCommodityFromDatabase(database));
  }

  return { name: 'balanceHistoryReport', inputSchema: optionsSchema, execute: queryBalanceHistory };
};
