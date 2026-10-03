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
  accountPrefixFilter: { accountPrefixFilter },
  apiOptions: {
    assertDate,
    dateBasis,
    parseOptions,
    stringList,
  },
  valuationRates: { queryValuationRates },
  valuationCommodity: { fromDatabase },
  zod: { z },
}) => {

  const ZERO = parseDecimal('0');
  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1)).optional(),
    dateBasis: z.enum(['posting', 'transaction'], { error: 'Invalid dateBasis' }).optional(),
    to: z.string().optional(),
  });

  function normalizeOptions(options) {
    const input = parseOptions(optionsSchema, options, 'gainReport');
    const normalized = {
      accounts: stringList(input.accounts, 'accounts', false),
      dateBasis: dateBasis(input.dateBasis),
      to: input.to,
    };
    assertDate(normalized.to, '--to');
    return normalized;
  }

  function reportFilter(options, valuationCommodity) {
    const clauses = ['r.commodity != ?'];
    const parameters = [valuationCommodity];
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.report_date';
    if (options.to) {
      clauses.push(`${dateExpression} <= ?`);
      parameters.push(options.to);
    }
    if (options.accounts.length > 0) {
      const accountFilter = accountPrefixFilter('p.account', options.accounts);
      clauses.push(accountFilter.sql);
      parameters.push(...accountFilter.parameters);
    }
    return { sql: `WHERE ${clauses.join('\n      AND ')}`, parameters };
  }

  function queryPositions(database, options, valuationCommodity) {
    const filter = reportFilter(options, valuationCommodity);
    return database.prepare(`
      SELECT
        p.account,
        r.commodity,
        decimal_sum(r.quantity) AS quantity,
        decimal_sum(CASE
          WHEN p.lot_cost_quantity IS NULL THEN NULL
          WHEN p.lot_cost_is_total = 1 THEN CASE
            WHEN decimal_cmp(r.quantity, '0') < 0 AND
                 decimal_cmp(p.lot_cost_quantity, '0') > 0
              THEN decimal_mul(p.lot_cost_quantity, '-1')
            ELSE p.lot_cost_quantity
          END
          ELSE decimal_mul(r.quantity, p.lot_cost_quantity)
        END) AS cost_basis,
        MIN(CASE WHEN p.lot_cost_quantity IS NULL THEN r.commodity END) AS missing_lot_cost
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      ${filter.sql}
      GROUP BY p.account, r.commodity
      HAVING decimal_cmp(decimal_sum(r.quantity), '0') != 0
      ORDER BY p.account, r.commodity
    `).all(...filter.parameters);
  }

  function calculateRows(positions, rates, valuationCommodity) {
    const gains = new Map();
    for (const position of positions) {
      if (position.missing_lot_cost) {
        throw new Error(
          `Cannot calculate unrealized gain for ${position.account}: ` +
          `${position.missing_lot_cost} has no lot cost`,
        );
      }
      const marketValue = multiplyDecimals(
        parseDecimal(position.quantity),
        parseDecimal(rates.get(position.commodity)),
      );
      const gain = subtractDecimals(marketValue, parseDecimal(position.cost_basis));
      gains.set(position.account, addDecimals(gains.get(position.account) || ZERO, gain));
    }
    return [...gains]
      .filter(([, gain]) => compareDecimals(gain, ZERO) !== 0)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([account, gain]) => ({
        account,
        quantity: formatDecimal(gain),
        commodity: valuationCommodity,
      }));
  }

  function queryGain(database, options, { valuationPriceCache }) {
    const normalizedOptions = normalizeOptions(options);
    const valuationCommodity = fromDatabase(database);
    const positions = queryPositions(database, normalizedOptions, valuationCommodity);
    const rates = queryValuationRates(
      database,
      normalizedOptions.to,
      new Set(positions.map((position) => position.commodity)),
      valuationPriceCache,
    );
    return calculateRows(positions, rates, valuationCommodity);
  }

  return { name: 'gainReport', inputSchema: optionsSchema, execute: queryGain };
};
