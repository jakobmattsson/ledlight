'use strict';

module.exports = ({
  apiOptions: { usage, parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    usage,
  });

  function queryTags(database, options, _caches) {
    const { usage } = parseOptions(optionsSchema, options, 'tags');
    return database.prepare(`
      SELECT name AS tag, used
      FROM tag_declarations
      WHERE ? = 'all' OR used = (? = 'used')
      ORDER BY tag, entry_id
    `).all(usage, usage)
      .map((row) => ({ ...row, used: Boolean(row.used) }));
  }

  return { inputSchema: optionsSchema, execute: queryTags };
};
