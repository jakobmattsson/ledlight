'use strict';

module.exports = ({
  journalLoaderFactory: { createJournalLoader },
  ledgerParser: { parse },
}) => {

  /**
 * Loads an include tree and returns flattened entries plus a SHA-256 source
 * manifest suitable for a future database freshness table.
 */
  const loadJournal = createJournalLoader(parse);

  return { loadJournal };
};
