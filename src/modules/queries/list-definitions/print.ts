'use strict';

module.exports = ({
  core: {
    apiOptions: { parseOptions },
  },
  journalPrinter: { printJournal },
  external: {
    zod: { z }
  },
}: any) => {
  const inputSchema = z.strictObject({
    density: z.enum(['compact', 'spacious']).default('spacious'),
    sortDeclarations: z.boolean().default(false),
  });

  function print(database: any, options: any, _caches: any) {
    return printJournal(database, parseOptions(inputSchema, options, 'print'));
  }

  return { inputSchema, execute: print };
};
