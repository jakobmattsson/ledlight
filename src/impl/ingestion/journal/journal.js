'use strict';

module.exports = ({
  journalLoaderFactory: { createJournalLoader },
  ledgerParser: { parse },
  publicErrors: { errorCodes, withCode },
}) => {

  /**
 * Loads an include tree and returns flattened entries plus a SHA-256 source
 * manifest suitable for a future database freshness table.
 */
  const load = createJournalLoader(parse);

  function loadJournal(journalPath, rootSource) {
    try {
      return load(journalPath, rootSource);
    } catch (error) {
      throw withCode(error, errorCodes.PROJECT_CONFIGURATION);
    }
  }

  return { loadJournal };
};
