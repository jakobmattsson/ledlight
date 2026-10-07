'use strict';

module.exports = ({
  apiOptions: { usage, parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    usage,
  });

  function queryCommodities(database, options, _caches) {
    const { usage } = parseOptions(optionsSchema, options, 'commodities');
    const rows = database.prepare(`
      SELECT declarations.symbol AS commodity, declarations.comment,
        declarations.used, properties.name, properties.value
      FROM commodity_declarations AS declarations
      LEFT JOIN commodity_properties AS properties
        ON properties.commodity_id = declarations.entry_id
      WHERE ? = 'all' OR declarations.used = (? = 'used')
      ORDER BY declarations.symbol, declarations.entry_id, properties.position
    `).all(usage, usage);
    const commodities = new Map();
    for (const row of rows) {
      const commodity = commodities.get(row.commodity) ?? {
        commodity: row.commodity,
        comment: row.comment,
        format: null,
        isDefault: false,
        used: Boolean(row.used),
      };
      if (row.name === 'format') commodity.format = row.value;
      if (row.name === 'default') commodity.isDefault = true;
      commodities.set(row.commodity, commodity);
    }
    return [...commodities.values()];
  }

  return { inputSchema: optionsSchema, execute: queryCommodities };
};
