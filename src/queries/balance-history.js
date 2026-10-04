'use strict';

module.exports = ({
  decimal: {
    formatDecimal,
    negateDecimal,
    parseDecimal,
  },
  accountFilter: { accountFilter },
  publicErrors: { createError, errorCodes },
  apiOptions: { parseOptions },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const accountFactorsSchema = z
    .record(z.string().min(1), z.union([z.string(), z.number()]))
    .default({})
    .transform((factors, context) => {
      const normalized = {};
      for (const [account, factor] of Object.entries(factors)) {
        const decimalFactor = String(factor);
        try {
          parseDecimal(decimalFactor);
        } catch {
          context.addIssue({
            code: 'custom',
            message: `Invalid account factor for ${account}: ${JSON.stringify(factor)}`,
          });
          return z.NEVER;
        }
        normalized[account] = decimalFactor;
      }
      return normalized;
    });
  const optionsSchema = z.strictObject({
    accountFactors: accountFactorsSchema,
    dateBasis: z.enum(['posting', 'transaction'], { error: 'Invalid dateBasis' }).default('posting'),
    from: z.iso.date({ error: 'Invalid --from date' }).optional(),
    invert: z.boolean({ error: 'must be a boolean' }).default(false),
    to: z.iso.date({ error: 'Invalid --to date' }).optional(),
  }).superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: 'custom',
        message: `--from date ${input.from} is after --to date ${input.to}`,
        path: ['from'],
      });
    }
  });

  function selectBalanceHistory(database, options, valuationCommodity) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    const factorEntries = Object.entries(options.accountFactors);
    const factorFilters = factorEntries.map(([pattern]) => accountFilter('p.account', [pattern]));
    const factorExpression = factorEntries.length > 0
      ? `CASE
          ${factorFilters.map((filter) => `WHEN ${filter.sql} THEN ?`).join('\n          ')}
          ELSE '1'
        END`
      : undefined;
    const selectionFilter = factorEntries.length > 0
      ? accountFilter('p.account', factorEntries.map(([pattern]) => pattern))
      : undefined;
    const parameters = factorEntries.flatMap(([, factor], index) => [
      ...factorFilters[index].parameters,
      factor,
    ]);
    parameters.push(...(selectionFilter?.parameters ?? []));
    const postingWhere = selectionFilter
      ? `WHERE ${selectionFilter.sql}`
      : '';
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
    parameters.push(options.to ?? null, options.from ?? null, options.to ?? null);
    const rows = database.prepare(`
    WITH RECURSIVE
      selected_changes AS (
        SELECT
          ${dateExpression} AS date,
          r.commodity,
          decimal_sum(r.quantity) AS quantity${factorExpression ? `,
          decimal_sum(decimal_mul(r.quantity, ${factorExpression})) AS factored_quantity` : ''}
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
      report_end(value) AS MATERIALIZED (
        ${reportEnd}
      ),
      positions(commodity, date, quantity${factorExpression ? ', factored_quantity' : ''}) AS (
        SELECT
          bounds.commodity,
          bounds.start_date,
          COALESCE(changes.quantity, '0')${factorExpression ? ",\n          COALESCE(changes.factored_quantity, '0')" : ''}
        FROM commodity_bounds AS bounds
        JOIN report_end ON bounds.start_date <= report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = bounds.commodity
          AND changes.date = bounds.start_date
        UNION ALL
        SELECT
          positions.commodity,
          date(positions.date, '+1 day'),
          decimal_add(positions.quantity, COALESCE(changes.quantity, '0'))${factorExpression ? ",\n          decimal_add(positions.factored_quantity, COALESCE(changes.factored_quantity, '0'))" : ''}
        FROM positions
        JOIN report_end ON positions.date < report_end.value
        LEFT JOIN selected_changes AS changes
          ON changes.commodity = positions.commodity
          AND changes.date = date(positions.date, '+1 day')
      ),
      daily_balances AS (
        SELECT
          positions.date,
          decimal_sum(decimal_mul(positions.quantity, valuation_prices.rate)) AS balance${factorExpression ? ",\n          decimal_sum(decimal_mul(positions.factored_quantity, valuation_prices.rate)) AS factored_balance" : ''},
          MIN(CASE
            WHEN valuation_prices.rate IS NULL
              AND decimal_cmp(positions.quantity, '0') != 0
            THEN positions.commodity
          END) AS missing_commodity
        FROM positions
        LEFT JOIN valuation_prices
          ON valuation_prices.commodity = positions.commodity
          AND valuation_prices.date = positions.date
        GROUP BY positions.date
      )
    SELECT date, balance AS amount${factorExpression ? ', factored_balance AS factored_amount' : ''}, missing_commodity
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
    return rows.map(({ date, amount, factored_amount: factoredAmount }) => {
      const value = options.invert
        ? formatDecimal(negateDecimal(parseDecimal(amount)))
        : amount;
      const factoredValue = options.invert && factoredAmount !== undefined
        ? formatDecimal(negateDecimal(parseDecimal(factoredAmount)))
        : factoredAmount;
      return {
        date,
        amount: value,
        commodity: valuationCommodity,
        ...(factorExpression ? { factoredAmount: factoredValue } : {}),
      };
    });
  }

  function queryBalanceHistory(database, options, _caches) {
    const reportOptions = parseOptions(optionsSchema, options, 'balanceHistoryReport');
    return selectBalanceHistory(database, reportOptions, valuationCommodityFromDatabase(database));
  }

  return { name: 'balanceHistoryReport', inputSchema: optionsSchema, execute: queryBalanceHistory };
};
