'use strict';

module.exports = ({
  core: {
    cachePaths: { pathsForJournal },
    publicErrors: { createError, databaseError, errorCodes },
  },
  queries: { definitions: queries },
  journal: {
    journal: { loadJournal },
    ingestionWarning: { groupWarnings },
  },
  database: {
    journalWriter: { writeJournalDatabase },
    database: { ensureDatabaseCurrent },
    databaseReader: { readDatabase },
  },
  external: {
    fs,
    os,
    path
  },
}: any) => {

  const apiDefinitions = Object.freeze(Object.fromEntries(queries.map(({ name, inputSchema }: any) => [
    name,
    { inputs: ['journalPath', ...Object.keys(inputSchema.shape)] },
  ])));
  const projectConfigurationError = (message: any) =>
    createError(errorCodes.PROJECT_CONFIGURATION, message);

  function queryDatabase(databasePath: any, operation: any) {
    try {
      return readDatabase(databasePath, operation);
    } catch (error: any) {
      throw databaseError(error);
    }
  }

  function journalPaths(journalPath: any) {
    try {
      return pathsForJournal(journalPath);
    } catch (error: any) {
      throw projectConfigurationError(error.message);
    }
  }

  function ensureCurrent(journalPath: any) {
    const paths = journalPaths(journalPath);
    try {
      fs.mkdirSync(path.dirname(paths.databasePath), { recursive: true, mode: 0o700 });
      const current: any = { ...paths, ...ensureDatabaseCurrent(paths.databasePath, paths.journalPath) };
      fs.chmodSync(paths.databasePath, 0o600);
      return current;
    } catch (error: any) {
      if (Object.values(errorCodes).includes(error.code)) throw error;
      throw createError(errorCodes.DATABASE, error.message);
    }
  }

  function openJournal(journalPath: any) {
    return journalFromDatabase(ensureCurrent(journalPath));
  }

  function withJournalText(content: any, baseDirectory: any, operation: any) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-stdin-'));
    try {
      const databasePath = path.join(directory, 'journal.sqlite');
      const journal = loadJournal('<stdin>', { content, baseDirectory });
      writeJournalDatabase(databasePath, journal);
      return operation(journalFromDatabase({ databasePath, journalPath: '<stdin>' }));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  function journalFromDatabase(current: any) {
    const warnings = groupWarnings(queryDatabase(
      current.databasePath,
      (database: any) => database.prepare(`
        SELECT code, message, source, line, column,
          start_line AS startLine, end_line AS endLine
        FROM ingestion_warnings
        ORDER BY position
      `).all(),
    ));
    const caches = Object.freeze({ valuationPriceCache: new Map() });
    const operations = Object.fromEntries(queries.map(({ name, execute }: any) => [
      name,
      (options: any) => queryDatabase(
        current.databasePath,
        (database: any) => execute(database, options, caches),
      ),
    ]));
    return {
      ...current,
      warnings,
      ...operations,
    };
  }

  return {
    apiDefinitions,
    openJournal,
    withJournalText,
    $$private: { journalFromDatabase },
  };
};
