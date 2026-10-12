'use strict';

type Database = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };
type Row = { commodity: string; comment: string | null; format: string | null; isDefault: number; used: number };

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

  function queryCommodities(database: Database, options: unknown, _caches: unknown) {
    const { usage } = parseOptions(optionsSchema, options, 'commodities');
    return (database.prepare(`
      SELECT symbol AS commodity, comment, format, is_default AS isDefault, used
      FROM commodity_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY symbol
    `).all(usage, usage) as Row[]).map((row) => ({
      ...row,
      isDefault: Boolean(row.isDefault),
      used: Boolean(row.used),
    }));
  }

  return { inputSchema: optionsSchema, execute: queryCommodities };
};
