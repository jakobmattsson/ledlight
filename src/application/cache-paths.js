'use strict';

module.exports = ({ crypto, fs, os, path, processEnvironment, processPlatform }) => {

  function cacheRoot() {
    if (processEnvironment.LEDLIGHT_CACHE_HOME) {
      return path.resolve(processEnvironment.LEDLIGHT_CACHE_HOME);
    }
    if (processPlatform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Caches', 'ledlight');
    }
    if (processPlatform === 'win32') {
      const localAppData = processEnvironment.LOCALAPPDATA ??
        path.join(os.homedir(), 'AppData', 'Local');
      return path.join(localAppData, 'ledlight', 'Cache');
    }
    const configuredCacheHome = processEnvironment.XDG_CACHE_HOME;
    const cacheHome = configuredCacheHome && path.isAbsolute(configuredCacheHome)
      ? configuredCacheHome
      : path.join(os.homedir(), '.cache');
    return path.join(cacheHome, 'ledlight');
  }

  function canonicalJournalPath(journalPath) {
    if (typeof journalPath !== 'string' || journalPath.length === 0) {
      throw new TypeError('journalPath must be a non-empty string');
    }
    const resolvedPath = fs.realpathSync.native(path.resolve(journalPath));
    if (!fs.statSync(resolvedPath).isFile()) {
      throw new TypeError(`Journal path is not a file: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  function pathsForJournal(journalPath) {
    const canonicalPath = canonicalJournalPath(journalPath);
    const identity = crypto.createHash('sha256').update(canonicalPath, 'utf8').digest('hex');
    return {
      journalPath: canonicalPath,
      databasePath: path.join(cacheRoot(), 'journals', identity, 'ledger.sqlite'),
    };
  }

  return { cacheRoot, canonicalJournalPath, pathsForJournal };
};
