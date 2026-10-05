'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    compareDecimals,
    formatDecimal,
    multiplyDecimals,
    parseDecimal,
    subtractDecimals,
  },
  accountFilter: { accountFilter },
  costCurrencies: { currencyCapitalAccount, queryCostCurrencies },
  apiOptions: { accounts, dateBasis, dateOption, parseOptions },
  valuationRates: { queryValuationRates },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  zod: { z },
}) => {

  const ZERO = parseDecimal('0');
  const optionsSchema = z.strictObject({
    accounts,
    dateBasis,
    to: dateOption,
  });

  function reportFilter(options, valuationCommodity) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    const clauses = [
      'r.commodity != ?',
      `${dateExpression} <= COALESCE(?, '9999-12-31')`,
    ];
    const parameters = [valuationCommodity, options.to ?? null];
    if (options.accounts.length > 0) {
      const filter = accountFilter('p.account', options.accounts);
      clauses.push(filter.sql);
      parameters.push(...filter.parameters);
    }
    return { sql: `WHERE ${clauses.join('\n      AND ')}`, parameters };
  }

  function queryPositions(database, options, valuationCommodity) {
    const filter = reportFilter(options, valuationCommodity);
    const currencies = queryCostCurrencies(database, valuationCommodity);
    database.function('currency_capital_account', { deterministic: true }, (commodity) =>
      currencies.has(commodity) ? currencyCapitalAccount(commodity) : null);
    return database.prepare(`
      WITH selected AS (
        SELECT
          COALESCE(currency_capital_account(r.commodity), p.account) AS account,
          currency_capital_account(r.commodity) IS NOT NULL AS is_currency_capital,
          r.commodity, r.quantity,
          p.lot_cost_quantity, p.lot_cost_commodity, p.lot_cost_is_total
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        ${filter.sql}
          AND (currency_capital_account(r.commodity) IS NULL OR p.lot_cost_quantity IS NOT NULL)
      ), open_positions AS (
        SELECT account, commodity, is_currency_capital
        FROM selected
        GROUP BY account, commodity, is_currency_capital
        HAVING decimal_cmp(decimal_sum(quantity), '0') != 0
      )
      SELECT
        account, commodity, is_currency_capital,
        lot_cost_commodity AS cost_commodity,
        decimal_sum(quantity) AS quantity,
        decimal_sum(CASE
          WHEN lot_cost_quantity IS NULL THEN NULL
          WHEN lot_cost_is_total = 1 THEN CASE
            WHEN decimal_cmp(quantity, '0') < 0 AND decimal_cmp(lot_cost_quantity, '0') > 0
              THEN decimal_mul(lot_cost_quantity, '-1')
            ELSE lot_cost_quantity
          END
          ELSE decimal_mul(quantity, lot_cost_quantity)
        END) AS cost_basis,
        MIN(CASE WHEN lot_cost_quantity IS NULL THEN commodity END) AS missing_lot_cost
      FROM selected
      JOIN open_positions USING (account, commodity, is_currency_capital)
      GROUP BY account, commodity, is_currency_capital, lot_cost_commodity
      ORDER BY account, commodity, lot_cost_commodity
    `).all(...filter.parameters);
  }

  function validateCostBases(positions) {
    for (const position of positions) {
      if (position.missing_lot_cost) {
        throw new Error(
          `Cannot calculate unrealized gain for ${position.account}: ` +
          `${position.missing_lot_cost} has no lot cost`,
        );
      }
    }
  }

  function calculateRows(positions, rates, valuationCommodity) {
    const gains = new Map();
    for (const position of positions) {
      const marketValue = multiplyDecimals(
        parseDecimal(position.quantity),
        parseDecimal(rates.get(position.commodity)),
      );
      const cost = parseDecimal(position.cost_basis);
      const costValue = compareDecimals(cost, ZERO) === 0 ? ZERO : multiplyDecimals(
        cost, parseDecimal(rates.get(position.cost_commodity)),
      );
      const gain = subtractDecimals(marketValue, costValue);
      const key = JSON.stringify([position.account, position.is_currency_capital]);
      const row = gains.get(key) || { account: position.account,
        isCurrencyCapital: Boolean(position.is_currency_capital), gain: ZERO };
      row.gain = addDecimals(row.gain, gain);
      gains.set(key, row);
    }
    return [...gains.values()]
      .filter(({ gain }) => compareDecimals(gain, ZERO) !== 0)
      .sort((left, right) => left.account.localeCompare(right.account, 'en'))
      .map(({ account, gain, isCurrencyCapital }) => ({
        account,
        quantity: formatDecimal(gain),
        commodity: valuationCommodity,
        ...(isCurrencyCapital ? { isCurrencyCapital: true } : {}),
      }));
  }

  function queryUnrealizedGains(database, options, { valuationPriceCache }) {
    const reportOptions = parseOptions(optionsSchema, options, 'unrealizedGains');
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const positions = queryPositions(database, reportOptions, valuationCommodity);
    validateCostBases(positions);
    const rates = queryValuationRates(
      database,
      reportOptions.to,
      new Set(positions.flatMap((position) => compareDecimals(parseDecimal(position.cost_basis), ZERO) === 0
        ? [position.commodity] : [position.commodity, position.cost_commodity])),
      valuationPriceCache,
    );
    return calculateRows(positions, rates, valuationCommodity);
  }

  return {
    name: 'unrealizedGains',
    inputSchema: optionsSchema,
    execute: queryUnrealizedGains,
  };
};
