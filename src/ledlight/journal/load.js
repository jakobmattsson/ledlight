'use strict';

module.exports = ({
  journalLoaderFactory: { createJournalLoader },
  ledgerParser: { parse },
  publicErrors: { errorCodes, withCode },
}) => {

  const apiDefinition = Object.freeze({ inputs: ['entryPath'] });

  /**
 * Loads an include tree and returns flattened entries plus a SHA-256 source
 * manifest suitable for a future database freshness table.
 */
  const load = createJournalLoader(parse);

  function loadJournal(entryPath) {
    try {
      return load(entryPath);
    } catch (error) {
      throw withCode(error, errorCodes.PROJECT_CONFIGURATION);
    }
  }

  return { apiDefinition, loadJournal };
};
