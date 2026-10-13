'use strict';
type Core = ReturnType<typeof import('../../interfaces/core')>;
type Journal = ReturnType<typeof import('../../interfaces/journal')>;
type Freshness = ReturnType<typeof import('./database-freshness')>;
type Lock = ReturnType<typeof import('./database-rebuild-lock')>;
type Writer = ReturnType<typeof import('./journal-writer')>;
type DatabaseSummary = ReturnType<Writer['writeJournalDatabase']>;
type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'stdin'; content: string; baseDirectory: string };
type Result = {
  prepareDatabase(databasePath: string, source: JournalSource): { journalPath: string };
  $$private: {
    buildDatabase(databasePath: string, source: JournalSource): DatabaseSummary;
    checkDatabaseSync: Freshness['checkDatabaseSync'];
  };
};
type Dependencies = {
  journal: Pick<Journal, 'loadJournal'>;
  databaseFreshness: Freshness;
  databaseRebuildLock: Pick<Lock, 'withRebuildLock'>;
  journalWriter: Writer;
  core: Pick<Core, 'publicErrors'>;
  external: { fs: Pick<typeof import('node:fs'), 'existsSync'>;
    path: Pick<typeof import('node:path'), 'resolve'> };
};

export = ({
  journal: {
    loadJournal,
  },
  databaseFreshness: { checkDatabaseSync },
  databaseRebuildLock: { withRebuildLock },
  journalWriter: { writeJournalDatabase },
  core: {
    publicErrors: { databaseError },
  },
  external: {
    fs,
    path
  },
}: Dependencies): Result => {

  function buildDatabase(databasePath: string, source: JournalSource): DatabaseSummary {
    try {
      return writeJournalDatabase(databasePath, loadJournal(source));
    } catch (error: unknown) {
      throw databaseError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  function prepareDatabase(databasePath: string, source: JournalSource): ReturnType<Result['prepareDatabase']> {
    if (source.kind === 'stdin') {
      if (fs.existsSync(databasePath)) {
        throw databaseError(new Error('A stdin source requires a new database path'));
      }
      const summary = buildDatabase(databasePath, source);
      return { journalPath: summary.journalPath };
    }
    const normalizedSource = { kind: 'file' as const, path: path.resolve(source.path) };
    const status = checkDatabaseSync(databasePath, normalizedSource.path);
    if (status.inSync) return { journalPath: status.journalPath };
    const rebuild = (): ReturnType<Result['prepareDatabase']> => {
      const lockedStatus = checkDatabaseSync(databasePath, normalizedSource.path);
      if (lockedStatus.inSync) return { journalPath: lockedStatus.journalPath };
      const summary = buildDatabase(databasePath, normalizedSource);
      return { journalPath: summary.journalPath };
    };
    return withRebuildLock(databasePath, rebuild);
  }

  return {
    prepareDatabase,
    $$private: { buildDatabase, checkDatabaseSync },
  };
};
