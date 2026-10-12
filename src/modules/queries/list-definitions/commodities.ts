'use strict';

module.exports = ({
  core: {
    apiOptions: { usage, parseOptions },
  },
  external: {
    zod: { z }
  },
}: any) => {
  const optionsSchema = z.strictObject({
    usage,
  });

  function queryCommodities(database: any, options: any, _caches: any) {
    const { usage } = parseOptions(optionsSchema, options, 'commodities');
    return database.prepare(`
      SELECT symbol AS commodity, comment, format, is_default AS isDefault, used
      FROM commodity_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY symbol
    `).all(usage, usage).map((row: any) => ({
      ...row,
      isDefault: Boolean(row.isDefault),
      used: Boolean(row.used),
    }));
  }

  return { inputSchema: optionsSchema, execute: queryCommodities };
};
