'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: { parseDecimal, registerDecimalFunctions },
  accountPrefixFilter: { accountPrefixFilter },
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
      accountFactors: options.accountFactors,
      dateBasis: options.dateBasis ?? 'posting',
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
    if (normalized.accountFactors !== undefined && (
      normalized.accountFactors === null ||
    Array.isArray(normalized.accountFactors) ||
    typeof normalized.accountFactors !== 'object'
    )) {
      throw new Error('accountFactors must be an object');
    }
    if (normalized.accountFactors) {
      normalized.accountFactors = Object.fromEntries(
        Object.entries(normalized.accountFactors).map(([account, factor]) => {
          if (!account) throw new Error('accountFactors keys must be non-empty accounts');
          const decimalFactor = String(factor);
          try {
            parseDecimal(decimalFactor);
          } catch {
            throw new Error(`Invalid account factor for ${account}: ${JSON.stringify(factor)}`);
          }
          return [account, decimalFactor];
        }),
      );
    }
    return normalized;
  }

  function queryBalanceHistory(database, options, valuationCommodity) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    const factorEntries = Object.entries(options.accountFactors ?? {});
    const factorExpression = factorEntries.length > 0
      ? `CASE p.account
          ${factorEntries.map(() => 'WHEN ? THEN ?').join('\n          ')}
          ELSE '1'
        END`
      : undefined;
    const postingClauses = [];
    const parameters = factorEntries.flatMap(([account, factor]) => [account, factor]);
    if (options.accounts.length > 0) {
      const accountFilter = accountPrefixFilter('p.account', options.accounts);
      postingClauses.push(accountFilter.sql);
      parameters.push(...accountFilter.parameters);
    }
    const postingWhere = postingClauses.length > 0
      ? `WHERE ${postingClauses.join('\n        AND ')}`
      : '';
    const latestSelectedDate = options.dateBasis === 'transaction'
      ? 'SELECT MAX(date) AS date FROM transactions'
      : 'SELECT MAX(report_date) AS date FROM postings';
    const reportEnd = options.to
      ? `SELECT MIN(date) AS value FROM (
        SELECT MAX(date) AS date FROM (
          ${latestSelectedDate}
          UNION ALL
          SELECT MAX(date) AS date FROM prices
        )
        UNION ALL
        SELECT ? AS date
      )`
      : `SELECT MAX(date) AS value FROM (
        ${latestSelectedDate}
        UNION ALL
        SELECT MAX(date) AS date FROM prices
      )`;
    if (options.to) parameters.push(options.to);
    const outputClauses = [];
    if (options.from) {
      outputClauses.push('date >= ?');
      parameters.push(options.from);
    }
    if (options.to) {
      outputClauses.push('date <= ?');
      parameters.push(options.to);
    }
    const outputWhere = outputClauses.length > 0
      ? `WHERE ${outputClauses.join('\n      AND ')}`
      : '';
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
      report_end(value) AS (
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
    ${outputWhere}
    ORDER BY date
  `).all(...parameters);
    for (const row of rows) {
      if (row.missing_commodity) {
        throw new Error(
          `No price for ${row.missing_commodity} on or before ${row.date} can convert it to ${valuationCommodity}`,
        );
      }
    }
    return rows.map(({ date, amount, factored_amount: factoredAmount }) => ({
      date,
      amount,
      commodity: valuationCommodity,
      ...(factorExpression ? { factoredAmount } : {}),
    }));
  }

  function queryBalanceHistoryReport(databasePath, options) {
    const normalizedOptions = normalizeOptions(options);
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      registerDecimalFunctions(database);
      return queryBalanceHistory(database, normalizedOptions, fromDatabase(database));
    } finally {
      database.close();
    }
  }

  return { queryBalanceHistoryReport };
};
