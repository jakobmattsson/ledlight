'use strict';

module.exports = ({ resolve, definitions }) => Object.freeze(definitions.map(({ name, fileName }) => {
  const query = resolve(name);
  if (typeof query.inputSchema?.safeParse !== 'function' ||
      typeof query.execute !== 'function' || query.execute.length !== 3) {
    throw new TypeError(`${fileName} must expose inputSchema and execute(database, options, caches)`);
  }
  return Object.freeze({ ...query, name });
}));
