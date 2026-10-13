'use strict';
type Core = ReturnType<typeof import('../../interfaces/core')>;
type Journal = ReturnType<typeof import('../../interfaces/journal')>;
type Freshness = ReturnType<typeof import('./database-freshness')>;
type Lock = ReturnType<typeof import('./database-rebuild-lock')>;
type Writer = ReturnType<typeof import('./journal-writer')>;
type DatabaseSummary = ReturnType<Writer['writeJournalDatabase']>;
type DatabaseStatus = ReturnType<Freshness['checkDatabaseSync']>;
type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'text'; content: string; baseDirectory: string; sourceName: string };
type Result = {
  prepareDatabase(databasePath: string, source: JournalSource): {
    rebuilt: boolean; status: DatabaseStatus; summary?: DatabaseSummary;
  };
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
    if (source.kind === 'text' && fs.existsSync(databasePath)) {
      throw databaseError(new Error('A text source requires a new database path'));
    }
    const normalizedSource = source.kind === 'file' ? { kind: 'file' as const, path: path.resolve(source.path) } : source;
    const status: DatabaseStatus = normalizedSource.kind === 'file'
      ? checkDatabaseSync(databasePath, normalizedSource.path)
      : {
        databasePath: path.resolve(databasePath), journalPath: normalizedSource.sourceName,
        inSync: false, reason: 'database_missing', added: [], removed: [], changed: [],
      };
    if (status.inSync) return { rebuilt: false, status };
    const rebuild = (): ReturnType<Result['prepareDatabase']> => {
      const lockedStatus = normalizedSource.kind === 'file'
        ? checkDatabaseSync(databasePath, normalizedSource.path) : status;
      if (lockedStatus.inSync) return { rebuilt: false, status: lockedStatus };
      const summary = buildDatabase(databasePath, normalizedSource);
      return { rebuilt: true, status: lockedStatus, summary };
    };
    return normalizedSource.kind === 'file' ? withRebuildLock(databasePath, rebuild) : rebuild();
  }

  return {
    prepareDatabase,
    $$private: { buildDatabase, checkDatabaseSync },
  };
};
