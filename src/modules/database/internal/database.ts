'use strict';

module.exports = ({
  journal: {
    journal: { loadJournal },
  },
  databaseFreshness: { checkDatabaseSync, databaseJournalPath },
  databaseRebuildLock: { withRebuildLock },
  journalWriter: { writeJournalDatabase },
  core: {
    publicErrors: { databaseError },
  },
  external: {
    path
  },
}: any) => {

  function buildDatabase(databasePath: any, journalPath: any) {
    try {
      return writeJournalDatabase(databasePath, loadJournal(journalPath));
    } catch (error: any) {
      throw databaseError(error);
    }
  }

  function ensureDatabaseCurrent(databasePath: any, sourceJournalPath: any) {
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
