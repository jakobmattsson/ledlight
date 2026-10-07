'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  journalPrinter: { printJournal },
  zod: { z },
}) => {
  const inputSchema = z.strictObject({});

  function print(database, options, _caches) {
    parseOptions(inputSchema, options, 'print');
    return printJournal(database);
  }

  return { inputSchema, execute: print };
};
