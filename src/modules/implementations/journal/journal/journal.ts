'use strict';

type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'stdin'; content: string; baseDirectory: string };

export = ({
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

  function loadJournal(source: JournalSource) {
    try {
      return load(source);
    } catch (error: any) {
      throw withCode(error, errorCodes.PROJECT_CONFIGURATION);
    }
  }

  return { loadJournal };
};
