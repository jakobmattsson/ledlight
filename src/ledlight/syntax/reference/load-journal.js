'use strict';

module.exports = ({
  srcLedlightJournalCreateLoader: { createJournalLoader },
  srcLedlightSyntaxReferenceParser: { parse },
}) => {




  const loadJournal = createJournalLoader(parse);

  return { loadJournal };
};
