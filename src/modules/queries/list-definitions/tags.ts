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

  function queryTags(database: any, options: any, _caches: any) {
    const { usage } = parseOptions(optionsSchema, options, 'tags');
    return database.prepare(`
      SELECT name AS tag, used
      FROM tag_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY tag, entry_id
    `).all(usage, usage)
      .map((row: any) => ({ ...row, used: Boolean(row.used) }));
  }

  return { inputSchema: optionsSchema, execute: queryTags };
};
