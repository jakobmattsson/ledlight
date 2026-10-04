'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryTags(database, options, _caches) {
    parseOptions(optionsSchema, options, 'tags');
    return database.prepare(`
      SELECT name AS tag
      FROM tag_declarations
      UNION
      SELECT name AS tag
      FROM transaction_tags
      UNION
      SELECT name AS tag
      FROM posting_tags
      ORDER BY tag
    `).all();
  }

  return { name: 'tags', inputSchema: optionsSchema, execute: queryTags };
};
