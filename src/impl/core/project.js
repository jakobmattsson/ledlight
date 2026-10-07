'use strict';

module.exports = ({
  cachePaths: { pathsForJournal },
  fs,
  path,
  queries,
  database: { ensureDatabaseCurrent },
  databaseReader: { readDatabase },
  ingestionWarning: { groupWarnings },
  publicErrors: { createError, databaseError, errorCodes },
}) => {

  const apiDefinitions = Object.freeze(Object.fromEntries(queries.map(({ name, inputSchema }) => [
    name,
    { inputs: ['journalPath', ...Object.keys(inputSchema.shape)] },
  ])));
  const projectConfigurationError = (message) =>
    createError(errorCodes.PROJECT_CONFIGURATION, message);

  function queryDatabase(databasePath, operation) {
    try {
      return readDatabase(databasePath, operation);
    } catch (error) {
      throw databaseError(error);
    }
  }

  function journalPaths(journalPath) {
    try {
      return pathsForJournal(journalPath);
    } catch (error) {
      throw projectConfigurationError(error.message);
    }
  }

  function ensureCurrent(journalPath) {
    const paths = journalPaths(journalPath);
    try {
      fs.mkdirSync(path.dirname(paths.databasePath), { recursive: true, mode: 0o700 });
      const current = { ...paths, ...ensureDatabaseCurrent(paths.databasePath, paths.journalPath) };
      fs.chmodSync(paths.databasePath, 0o600);
      return current;
    } catch (error) {
      if (Object.values(errorCodes).includes(error.code)) throw error;
      throw createError(errorCodes.DATABASE, error.message);
    }
  }

  function openJournal(journalPath) {
    return journalFromDatabase(ensureCurrent(journalPath));
  }

  function journalFromDatabase(current) {
    const warnings = groupWarnings(queryDatabase(
      current.databasePath,
      (database) => database.prepare(`
        SELECT code, message, source, line, column,
          start_line AS startLine, end_line AS endLine
        FROM ingestion_warnings
        ORDER BY position
      `).all(),
    ));
    const caches = Object.freeze({ valuationPriceCache: new Map() });
    const operations = Object.fromEntries(queries.map(({ name, execute }) => [
      name,
      (options) => queryDatabase(
        current.databasePath,
        (database) => execute(database, options, caches),
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
    $$private: { journalFromDatabase },
  };
};
