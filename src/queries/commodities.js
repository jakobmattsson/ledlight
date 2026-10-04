'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    usage: z.enum(['all', 'used', 'unused']).default('all'),
  });

  function queryCommodities(database, options, _caches) {
    const { usage } = parseOptions(optionsSchema, options, 'commodities');
    return database.prepare(`
      SELECT symbol AS commodity, used
      FROM commodity_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY commodity, entry_id
    `).all(usage, usage)
      .map((row) => ({ ...row, used: Boolean(row.used) }));
  }

  return { name: 'commodities', inputSchema: optionsSchema, execute: queryCommodities };
};
