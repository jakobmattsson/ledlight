'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryPrices(database, options, _caches) {
    parseOptions(optionsSchema, options, 'prices');
    return database.prepare(`
      SELECT
        prices.date,
        prices.base_commodity AS baseCommodity,
        prices.quote_quantity AS quoteQuantity,
        prices.quote_commodity AS quoteCommodity,
        prices.comment
      FROM prices
      JOIN journal_entries AS entries ON entries.id = prices.entry_id
      ORDER BY prices.date, entries.sequence
    `).all();
  }

  return { name: 'prices', inputSchema: optionsSchema, execute: queryPrices };
};
