'use strict';

module.exports = ({
  path,
  sqlite: Database,
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryCommodityDescriptions(databasePath, options) {
    parseOptions(optionsSchema, options, 'commodityDescriptions');
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const rows = database.prepare(`
        SELECT declarations.symbol AS commodity, declarations.comment,
          properties.name, properties.value
        FROM commodity_declarations AS declarations
        JOIN journal_entries AS entries ON entries.id = declarations.entry_id
        LEFT JOIN commodity_properties AS properties
          ON properties.commodity_id = declarations.entry_id
        ORDER BY entries.sequence, properties.position
      `).all();
      const descriptions = new Map();
      for (const row of rows) {
        const description = descriptions.get(row.commodity) ?? {
          commodity: row.commodity,
          comment: null,
          format: null,
          isDefault: false,
        };
        description.comment = row.comment;
        if (row.name === 'format') description.format = row.value;
        if (row.name === 'default') description.isDefault = true;
        descriptions.set(row.commodity, description);
      }
      return [...descriptions.values()].sort((left, right) =>
        left.commodity.localeCompare(right.commodity));
    } finally {
      database.close();
    }
  }

  return { name: 'commodityDescriptions', inputSchema: optionsSchema, execute: queryCommodityDescriptions };
};
