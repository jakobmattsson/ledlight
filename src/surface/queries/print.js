'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  journalPrinter: { printJournal },
  publicErrors: { createError, errorCodes },
  zod: { z },
}) => {
  const inputSchema = z.strictObject({});

  function print(database, options, _caches) {
    if (options !== undefined) {
      throw createError(errorCodes.INVALID_API_INPUT, 'print does not accept arguments', TypeError);
    }
    parseOptions(inputSchema, options, 'print');
    return printJournal(database);
  }

  return { inputSchema, execute: print };
};
