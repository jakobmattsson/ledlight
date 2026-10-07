'use strict';

module.exports = ({
  fs, os, path, standardInput, currentWorkingDirectory,
  journal: { loadJournal },
  journalWriter: { writeJournalDatabase },
  project: { $$private: { journalFromDatabase } },
}) => {
  function withJournal(source, operation) {
    const content = source ?? standardInput.read();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-stdin-'));
    try {
      const databasePath = path.join(directory, 'journal.sqlite');
      const journal = loadJournal('<stdin>', {
        content, baseDirectory: currentWorkingDirectory(),
      });
      writeJournalDatabase(databasePath, journal);
      return operation(journalFromDatabase({ databasePath, journalPath: '<stdin>' }));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  return { withJournal };
};
