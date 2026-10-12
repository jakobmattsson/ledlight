'use strict';

module.exports = ({
  core: {
    apiOptions: { parseOptions },
  },
  external: {
    zod: { z }
  },
}: any) => {
  const inputSchema = z.strictObject({});

  function validate(_database: any, options: any, _caches: any) {
    parseOptions(inputSchema, options, 'validate');
    return '';
  }

  return { inputSchema, execute: validate };
};
