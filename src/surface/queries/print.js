'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  publicErrors: { createError, errorCodes },
  zod: { z },
}) => {
  const inputSchema = z.strictObject({});

  function print(database, options, _caches) {
    if (options !== undefined) {
      throw createError(errorCodes.INVALID_API_INPUT, 'print does not accept arguments', TypeError);
    }
    parseOptions(inputSchema, options, 'print');
    const entries = database.prepare(`
      SELECT printed_text FROM journal_entries ORDER BY id
    `).pluck().all();
    return entries.length === 0 ? '' : `${entries.join('\n\n')}\n`;
  }

  return { inputSchema, execute: print };
};
