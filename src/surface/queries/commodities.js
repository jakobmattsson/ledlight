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
    return database.prepare(`
      SELECT symbol AS commodity, comment, format, is_default AS isDefault, used
      FROM commodity_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY symbol
    `).all(usage, usage).map((row) => ({
      ...row,
      isDefault: Boolean(row.isDefault),
      used: Boolean(row.used),
    }));
  }

  return { inputSchema: optionsSchema, execute: queryCommodities };
};
