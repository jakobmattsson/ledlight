'use strict';

module.exports = ({
  core: {
    apiOptions: { parseOptions },
  },
  journalPrinter: { printJournal },
  external: {
    zod: { z }
  },
}) => {
  const inputSchema = z.strictObject({
    density: z.enum(['compact', 'spacious']).default('spacious'),
    sortDeclarations: z.boolean().default(false),
  });

  function print(database, options, _caches) {
    return printJournal(database, parseOptions(inputSchema, options, 'print'));
  }

  return { inputSchema, execute: print };
};
