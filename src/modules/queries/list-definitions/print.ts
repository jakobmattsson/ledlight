'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  journalPrinter: { printJournal },
  external: {
    zod: { z }
  },
}: any) => {
  const inputSchema = z.strictObject({
    density: z.enum(['compact', 'spacious']).default('spacious'),
    sortDeclarations: z.boolean().default(false),
  });

  function print(database: unknown, options: unknown, _caches: unknown) {
    return printJournal(database, parseOptions(inputSchema, options, 'print'));
  }

  return { inputSchema, execute: print };
};
