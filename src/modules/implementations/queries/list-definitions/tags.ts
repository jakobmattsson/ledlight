'use strict';

type Database = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };
type Row = { tag: string; used: number };

module.exports = ({
  apiOptions: { usage, parseOptions },
  external: {
    zod: { z }
  },
}: any) => {
  const optionsSchema = z.strictObject({
    usage,
  });

  function queryTags(database: Database, options: unknown, _caches: unknown) {
    const { usage } = parseOptions(optionsSchema, options, 'tags');
    return (database.prepare(`
      SELECT name AS tag, used
      FROM tag_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY tag, entry_id
    `).all(usage, usage) as Row[]).map((row) => ({ ...row, used: Boolean(row.used) }));
  }

  return { inputSchema: optionsSchema, execute: queryTags };
};
