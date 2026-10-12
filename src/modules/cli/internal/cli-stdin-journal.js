'use strict';

module.exports = ({
  project: { withJournalText },
  external: {
    standardInput,
    currentWorkingDirectory
  },
}) => {
  function withJournal(source, operation) {
    const content = source ?? standardInput.read();
    return withJournalText(content, currentWorkingDirectory(), operation);
  }

  return { withJournal };
};
