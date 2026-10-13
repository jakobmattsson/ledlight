'use strict';

type JournalPaths = { journalPath: string; databasePath: string };
type CachePaths = {
  pathsForJournal(journalPath: string): JournalPaths;
  $$private: { cacheRoot(): string; canonicalJournalPath(journalPath: string): string };
};

export = ({
  core: { readConfiguration },
  external: {
    crypto,
    envPaths,
    fs,
    path,
    processEnvironment
  },
}: {
  core: { readConfiguration(): { cacheHome?: string } };
  external: {
    crypto: Pick<typeof import('node:crypto'), 'createHash'>;
    envPaths: (name: string, options: { suffix: string }) => { cache: string };
    fs: { realpathSync: { native(path: string): string }; statSync(path: string): { isFile(): boolean } };
    path: Pick<typeof import('node:path'), 'resolve' | 'join'>;
    processEnvironment: NodeJS.ProcessEnv;
  };
}): CachePaths => {

  function cacheRoot(): string {
    if (processEnvironment.LEDLIGHT_CACHE_HOME) {
      return path.resolve(processEnvironment.LEDLIGHT_CACHE_HOME);
    }
    const { cacheHome } = readConfiguration();
    if (cacheHome) return cacheHome;
    return envPaths('ledlight', { suffix: '' }).cache;
  }

  function canonicalJournalPath(journalPath: string): string {
    if (typeof journalPath !== 'string' || journalPath.length === 0) {
      throw new TypeError('journalPath must be a non-empty string');
    }
    const resolvedPath = fs.realpathSync.native(path.resolve(journalPath));
    if (!fs.statSync(resolvedPath).isFile()) {
      throw new TypeError(`Journal path is not a file: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  function pathsForJournal(journalPath: string): JournalPaths {
    const canonicalPath = canonicalJournalPath(journalPath);
    const identity = crypto.createHash('sha256').update(canonicalPath, 'utf8').digest('hex');
    return {
      journalPath: canonicalPath,
      databasePath: path.join(cacheRoot(), 'journals', identity, 'ledger.sqlite'),
    };
  }

  return {
    pathsForJournal,
    $$private: { cacheRoot, canonicalJournalPath },
  };
};
