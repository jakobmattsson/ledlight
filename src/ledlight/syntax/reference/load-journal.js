'use strict';

module.exports = ({
  journalLoaderFactory: { createJournalLoader },
  referenceParser: { parse },
}) => {

  const loadJournal = createJournalLoader(parse);

  return { loadJournal };
};
