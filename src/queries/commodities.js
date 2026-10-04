'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryCommodities(database, options, _caches) {
    parseOptions(optionsSchema, options, 'commodities');
    return database.prepare(`
      SELECT symbol AS commodity
      FROM commodity_declarations
      ORDER BY commodity, entry_id
    `).all();
  }

  return { name: 'commodities', inputSchema: optionsSchema, execute: queryCommodities };
};
