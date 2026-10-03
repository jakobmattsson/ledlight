'use strict';

module.exports = ({
  path,
  journal: { loadJournal },
  databaseFreshness: { checkDatabaseSync, databaseJournalPath },
  databaseRebuildLock: { withRebuildLock },
  journalWriter: { writeJournalDatabase },
  publicErrors: { databaseError },
}) => {

  function buildDatabase(databasePath, entryPath) {
    try {
      return writeJournalDatabase(databasePath, loadJournal(entryPath));
    } catch (error) {
      throw databaseError(error);
    }
  }

  function ensureDatabaseCurrent(databasePath, entryPath) {
    const journalPath = entryPath ? path.resolve(entryPath) : databaseJournalPath(databasePath);
    if (!journalPath) {
      throw databaseError(new Error('Cannot update the database without a journal path'));
    }
    const status = checkDatabaseSync(databasePath, journalPath);
    if (status.inSync) return { rebuilt: false, status };
    return withRebuildLock(databasePath, () => {
      const lockedStatus = checkDatabaseSync(databasePath, journalPath);
      if (lockedStatus.inSync) return { rebuilt: false, status: lockedStatus };
      const summary = buildDatabase(databasePath, journalPath);
      return { rebuilt: true, status: lockedStatus, summary };
    });
  }

  return {
    ensureDatabaseCurrent,
    $$private: { buildDatabase, checkDatabaseSync },
  };
};
