'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  external: {
    zod: { z }
  },
}: any) => {
  const inputSchema = z.strictObject({});

  function validate(_database: unknown, options: unknown, _caches: unknown) {
    parseOptions(inputSchema, options, 'validate');
    return '';
  }

  return { inputSchema, execute: validate };
};
