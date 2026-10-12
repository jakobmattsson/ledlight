'use strict';

import type { UnrealizedGainsOptions } from '../../../public-api';

type Options = UnrealizedGainsOptions & { accounts: string[] };
type Database = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };
type Position = { account: string; commodity: string; quantity: string; cost_basis: string; missing_lot_cost: string | null; foreign_lot_cost_commodity: string | null };
type Decimal = { coefficient: bigint; scale: number };
type Cache = Map<symbol, (commodity: string, throughDate: string) => string>;


module.exports = ({
  core: {
    decimal: {
      addDecimals,
      compareDecimals,
      formatDecimal,
      multiplyDecimals,
      parseDecimal,
      subtractDecimals,
    },
    apiOptions: { accounts, dateBasis, dateOption, parseOptions },
  },
  accountFilter: { accountFilter },
  valuationRates: { queryValuationRates },
  databaseValuationCommodity: { valuationCommodityFromDatabase },
  external: {
    zod: { z }
  },
}: any) => {

  const ZERO = parseDecimal('0');
  const optionsSchema = z.strictObject({
    accounts,
    dateBasis,
    to: dateOption,
  });

  function reportFilter(options: Options, valuationCommodity: string) {
    const dateExpression = options.dateBasis === 'transaction' ? 't.date' : 'p.posting_date';
    const clauses = [
      'r.amount_commodity != ?',
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

  function queryPositions(database: Database, options: Options, valuationCommodity: string) {
    const filter = reportFilter(options, valuationCommodity);
    return database.prepare(`
      SELECT
        p.account,
        r.amount_commodity AS commodity,
        decimal_sum(r.amount_quantity) AS quantity,
        decimal_sum(CASE
          WHEN p.lot_cost_quantity IS NULL THEN NULL
          WHEN p.lot_cost_is_total = 1 THEN CASE
            WHEN decimal_cmp(r.amount_quantity, '0') < 0 AND
                 decimal_cmp(p.lot_cost_quantity, '0') > 0
              THEN decimal_mul(p.lot_cost_quantity, '-1')
            ELSE p.lot_cost_quantity
          END
          ELSE decimal_mul(r.amount_quantity, p.lot_cost_quantity)
        END) AS cost_basis,
        MIN(CASE WHEN p.lot_cost_quantity IS NULL THEN r.amount_commodity END) AS missing_lot_cost,
        MIN(CASE
          WHEN p.lot_cost_commodity != ? THEN p.lot_cost_commodity
        END) AS foreign_lot_cost_commodity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      ${filter.sql}
      GROUP BY p.account, r.amount_commodity
      HAVING decimal_cmp(decimal_sum(r.amount_quantity), '0') != 0
      ORDER BY p.account, r.amount_commodity
    `).all(valuationCommodity, ...filter.parameters) as Position[];
  }

  function validateCostBases(positions: Position[]) {
    for (const position of positions) {
      if (position.missing_lot_cost) {
        throw new Error(
          `Cannot calculate unrealized gain for ${position.account}: ` +
          `${position.missing_lot_cost} has no lot cost`,
        );
      }
    }
  }

  function calculateRows(positions: Position[], rates: Map<string, string>, valuationCommodity: string) {
    const gains = new Map<string, Decimal>();
    for (const position of positions) {
      const marketValue = multiplyDecimals(
        parseDecimal(position.quantity),
        parseDecimal(rates.get(position.commodity)),
      );
      const gain = subtractDecimals(marketValue, parseDecimal(position.cost_basis));
      gains.set(position.account, addDecimals(gains.get(position.account) || ZERO, gain));
    }
    return [...gains]
      .filter(([, gain]) => compareDecimals(gain, ZERO) !== 0)
      .sort(([left], [right]: any) => left.localeCompare(right, 'en'))
      .map(([account, gain]) => ({
        account,
        quantity: formatDecimal(gain),
        commodity: valuationCommodity,
      }));
  }

  function queryUnrealizedGains(database: Database, options: Options, { valuationPriceCache }: { valuationPriceCache: Cache }) {
    const reportOptions = parseOptions(optionsSchema, options, 'unrealizedGains') as Options;
    const valuationCommodity = valuationCommodityFromDatabase(database);
    const positions = queryPositions(database, reportOptions, valuationCommodity)
      .filter((position) => !position.foreign_lot_cost_commodity);
    validateCostBases(positions);
    const rates = queryValuationRates(
      database,
      reportOptions.to,
      new Set(positions.map((position) => position.commodity)),
      valuationPriceCache,
    );
    return calculateRows(positions, rates, valuationCommodity);
  }

  return {
    inputSchema: optionsSchema,
    execute: queryUnrealizedGains,
  };
};
