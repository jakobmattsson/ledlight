'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({});

  function queryTags(database, options, _caches) {
    parseOptions(optionsSchema, options, 'tags');
    return database.prepare(`
      SELECT DISTINCT name AS tag
      FROM tag_declarations
      ORDER BY tag
    `).all();
  }

  return { name: 'tags', inputSchema: optionsSchema, execute: queryTags };
};
