'use strict';

module.exports = ({
  path,
  journal: { loadJournal },
  databaseFreshness: { checkDatabaseSync, databaseJournalPath },
  journalWriter: { writeJournalDatabase },
}) => {

  function buildDatabase(databasePath, entryPath) {
    return writeJournalDatabase(databasePath, loadJournal(entryPath));
  }

  function ensureDatabaseCurrent(databasePath, entryPath) {
    const journalPath = entryPath ? path.resolve(entryPath) : databaseJournalPath(databasePath);
    if (!journalPath) {
      throw new Error('Cannot update the database without a journal path');
    }
    const status = checkDatabaseSync(databasePath, journalPath);
    if (status.inSync) return { rebuilt: false, status };
    const summary = buildDatabase(databasePath, journalPath);
    return { rebuilt: true, status, summary };
  }

  return {
    ensureDatabaseCurrent,
    $$private: { buildDatabase, checkDatabaseSync },
  };
};
