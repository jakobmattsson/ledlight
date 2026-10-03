'use strict';

module.exports = ({
  valuationRates: { createLedgerValuationRateResolver },
}) => {

  function materializeValuationPrices(database, valuationCommodity) {
    if (!valuationCommodity) return 0;
    const introductions = database.prepare(`
      WITH commodity_introductions AS (
        SELECT r.commodity, MIN(p.report_date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        GROUP BY r.commodity
        UNION ALL
        SELECT r.commodity, MIN(t.date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        GROUP BY r.commodity
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
    const latestDate = database.prepare(`
      SELECT MAX(date) FROM (
        SELECT MAX(report_date) AS date FROM postings
        UNION ALL
        SELECT MAX(date) AS date FROM transactions
        UNION ALL
        SELECT MAX(date) AS date FROM prices
      )
    `).pluck().get();
    if (!latestDate) return 0;
    const priceRows = database.prepare(`
      SELECT p.date, p.base_commodity, p.quote_quantity, p.quote_commodity
      FROM prices AS p
      JOIN journal_entries AS e ON e.id = p.entry_id
      ORDER BY p.base_commodity, p.date, e.sequence
    `).all();
    const resolve = createLedgerValuationRateResolver(priceRows, valuationCommodity);
    const insert = database.prepare(
      'INSERT INTO valuation_prices (commodity, date, rate) VALUES (?, ?, ?)',
    );
    const nextDate = database.prepare("SELECT date(?, '+1 day')").pluck();
    let changes = 0;
    for (const { commodity, start_date: startDate } of introductions) {
      for (let date = startDate; date <= latestDate; date = nextDate.get(date)) {
        try {
          insert.run(commodity, date, resolve(commodity, date));
          changes += 1;
        } catch (error) {
          if (!error.message.startsWith('No price for ') &&
              !error.message.startsWith('Circular price chain ')) throw error;
        }
      }
    }
    return changes;
  }

  return { materializeValuationPrices };
};
