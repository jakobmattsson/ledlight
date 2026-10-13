'use strict';

module.exports = ({
  project: { withJournalText },
  external: {
    standardInput,
    currentWorkingDirectory
  },
}: any) => {
  function withJournal(source: any, operation: any) {
    const content = source ?? standardInput.read();
    return withJournalText(content, currentWorkingDirectory(), operation);
  }

  return { withJournal };
};
