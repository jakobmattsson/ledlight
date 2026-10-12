'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  external: {
    zod: { z }
  },
}) => {
  const inputSchema = z.strictObject({});

  function validate(_database, options, _caches) {
    parseOptions(inputSchema, options, 'validate');
    return '';
  }

  return { inputSchema, execute: validate };
};
