'use strict';
type Core = ReturnType<typeof import('../../interfaces/core')>;
type Journal = ReturnType<typeof import('../../interfaces/journal')>;
type Freshness = ReturnType<typeof import('./database-freshness')>;
type Lock = ReturnType<typeof import('./database-rebuild-lock')>;
type Writer = ReturnType<typeof import('./journal-writer')>;
type DatabaseSummary = ReturnType<Writer['writeJournalDatabase']>;
type DatabaseStatus = ReturnType<Freshness['checkDatabaseSync']>;
type Result = {
  ensureDatabaseCurrent(databasePath: string, sourceJournalPath: string): {
    rebuilt: boolean; status: DatabaseStatus; summary?: DatabaseSummary;
  };
  $$private: {
    buildDatabase(databasePath: string, journalPath: string): DatabaseSummary;
    checkDatabaseSync: Freshness['checkDatabaseSync'];
  };
};
type Dependencies = {
  journal: Pick<Journal, 'loadJournal'>;
  databaseFreshness: Freshness;
  databaseRebuildLock: Pick<Lock, 'withRebuildLock'>;
  journalWriter: Writer;
  core: Pick<Core, 'publicErrors'>;
  external: { path: Pick<typeof import('node:path'), 'resolve'> };
};

export = ({
  journal: {
    loadJournal,
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
}: Dependencies): Result => {

  function buildDatabase(databasePath: string, journalPath: string): DatabaseSummary {
    try {
      return writeJournalDatabase(databasePath, loadJournal(journalPath));
    } catch (error: unknown) {
      throw databaseError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  function ensureDatabaseCurrent(databasePath: string, sourceJournalPath: string): ReturnType<Result['ensureDatabaseCurrent']> {
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
