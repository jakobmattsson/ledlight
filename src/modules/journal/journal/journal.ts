'use strict';

module.exports = ({
  journalLoaderFactory: { createJournalLoader },
  ledgerParser: { parse },
  core: {
    publicErrors: { errorCodes, withCode },
  },
}: any) => {

  /**
 * Loads an include tree and returns flattened entries plus a SHA-256 source
 * manifest suitable for a future database freshness table.
 */
  const load = createJournalLoader(parse);

  function loadJournal(journalPath: string, rootSource: string | undefined) {
    try {
      return load(journalPath, rootSource);
    } catch (error: any) {
      throw withCode(error, errorCodes.PROJECT_CONFIGURATION);
    }
  }

  return { loadJournal };
};
