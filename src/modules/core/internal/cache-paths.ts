'use strict';

module.exports = ({
  configuration,
  external: {
    crypto,
    envPaths,
    fs,
    path,
    processEnvironment
  },
}: any) => {

  function cacheRoot() {
    if (processEnvironment.LEDLIGHT_CACHE_HOME) {
      return path.resolve(processEnvironment.LEDLIGHT_CACHE_HOME);
    }
    const { cacheHome } = configuration.read();
    if (cacheHome) return cacheHome;
    return envPaths('ledlight', { suffix: '' }).cache;
  }

  function canonicalJournalPath(journalPath: any) {
    if (typeof journalPath !== 'string' || journalPath.length === 0) {
      throw new TypeError('journalPath must be a non-empty string');
    }
    const resolvedPath = fs.realpathSync.native(path.resolve(journalPath));
    if (!fs.statSync(resolvedPath).isFile()) {
      throw new TypeError(`Journal path is not a file: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  function pathsForJournal(journalPath: any) {
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
