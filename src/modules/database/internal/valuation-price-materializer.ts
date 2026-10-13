'use strict';
import type { SqliteDatabase } from './sqlite-contracts';

type Core = ReturnType<typeof import('../../core')>;
type Dependencies = { core: Pick<Core, 'createLedgerValuationRateResolver'> };
type Introduction = { commodity: string; start_date: string };
type PriceRow = { date: string; base_commodity: string; quote_quantity: string; quote_commodity: string };
type Result = { materializeValuationPrices(database: SqliteDatabase, valuationCommodity: string | null): number };

export = ({
  core: {
    createLedgerValuationRateResolver,
  },
}: Dependencies): Result => {

  function materializeValuationPrices(database: SqliteDatabase, valuationCommodity: string | null): number {
    if (!valuationCommodity) return 0;
    const introductions = database.prepare<Introduction>(`
      WITH commodity_introductions AS (
        SELECT r.amount_commodity AS commodity, MIN(p.posting_date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        GROUP BY r.amount_commodity
        UNION ALL
        SELECT r.amount_commodity, MIN(t.date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        GROUP BY r.amount_commodity
        UNION ALL
        SELECT base_commodity, MIN(date) FROM prices GROUP BY base_commodity
        UNION ALL
        SELECT quote_commodity, MIN(date)
        FROM prices
        GROUP BY quote_commodity
      )
      SELECT commodity, MIN(date) AS start_date
      FROM commodity_introductions
      GROUP BY commodity
      ORDER BY commodity
    `).all();
    const latestDate = database.prepare<string | null>(`
      SELECT MAX(date) FROM (
        SELECT MAX(posting_date) AS date FROM postings
        UNION ALL
        SELECT MAX(date) AS date FROM transactions
        UNION ALL
        SELECT MAX(date) AS date FROM prices
      )
    `).pluck().get();
    if (!latestDate) return 0;
    const priceRows = database.prepare<PriceRow>(`
      SELECT p.date, p.base_commodity, p.quote_quantity, p.quote_commodity
      FROM prices AS p
      ORDER BY p.base_commodity, p.date, p.entry_id
    `).all();
    const resolve = createLedgerValuationRateResolver(priceRows, valuationCommodity);
    const insert = database.prepare(
      'INSERT INTO valuation_prices (commodity, date, rate) VALUES (?, ?, ?)',
    );
    const nextDate = database.prepare<string | null>("SELECT date(?, '+1 day')").pluck();
    let changes = 0;
    for (const { commodity, start_date: startDate } of introductions) {
      for (let date: string | null | undefined = startDate; date && date <= latestDate; date = nextDate.get(date)) {
        try {
          insert.run(commodity, date, resolve(commodity, date));
          changes += 1;
        } catch (error: unknown) {
          if (!(error instanceof Error) ||
              (!error.message.startsWith('No price for ') &&
               !error.message.startsWith('Circular price chain '))) throw error;
        }
      }
    }
    return changes;
  }

  return { materializeValuationPrices };
};
