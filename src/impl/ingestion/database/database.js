'use strict';

module.exports = ({
  path,
  journal: { loadJournal },
  databaseFreshness: { checkDatabaseSync, databaseJournalPath },
  databaseRebuildLock: { withRebuildLock },
  journalWriter: { writeJournalDatabase },
  publicErrors: { databaseError },
}) => {

  function buildDatabase(databasePath, journalPath) {
    try {
      return writeJournalDatabase(databasePath, loadJournal(journalPath));
    } catch (error) {
      throw databaseError(error);
    }
  }

  function ensureDatabaseCurrent(databasePath, sourceJournalPath) {
    const journalPath = sourceJournalPath ? path.resolve(sourceJournalPath) : databaseJournalPath(databasePath);
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
