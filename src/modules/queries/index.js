'use strict';

module.exports = ({ definitions }) => {
  const queries = definitions.map(({ name, fileName, value: query }) => {
    if (typeof query.inputSchema?.safeParse !== 'function' ||
        typeof query.execute !== 'function' || query.execute.length !== 3) {
      throw new TypeError(`${fileName} must expose inputSchema and execute(database, options, caches)`);
    }
    return Object.freeze({ ...query, name });
  });
  return { definitions: Object.freeze(queries) };
};
