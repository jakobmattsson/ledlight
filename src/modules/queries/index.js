'use strict';

module.exports = ({ definitions }) => {
  const queries = definitions.map(({ name, relativePath, value: query }) => {
    if (!/^[a-z]+(?:-[a-z]+)*\.js$/u.test(relativePath)) {
      throw new TypeError(`Query definition must be directly inside list-definitions: ${relativePath}`);
    }
    if (typeof query.inputSchema?.safeParse !== 'function' ||
        typeof query.execute !== 'function' || query.execute.length !== 3) {
      throw new TypeError(`${relativePath} must expose inputSchema and execute(database, options, caches)`);
    }
    return Object.freeze({ ...query, name });
  });
  return { definitions: Object.freeze(queries) };
};
