'use strict';

type Database = { prepare(sql: string): { all(...parameters: unknown[]): unknown[] } };
type QueryDefinition = { name: string; inputSchema: { shape: Record<string, unknown> };
  execute(database: Database, options: unknown, caches: unknown): unknown };
type CurrentJournal = { databasePath: string; journalPath: string };


export = ({
  core: {
    pathsForJournal,
    publicErrors: { createError, databaseError, errorCodes },
  },
  queries: { definitions: queries },
  journal: {
    loadJournal,
    ingestionWarning: { groupWarnings },
  },
  database: {
    writeJournalDatabase,
    ensureDatabaseCurrent,
    readDatabase,
  },
  external: {
    fs,
    os,
    path
  },
}: any) => {

  const apiDefinitions = Object.freeze(Object.fromEntries(queries.map(({ name, inputSchema }: QueryDefinition) => [
    name,
    { inputs: ['journalPath', ...Object.keys(inputSchema.shape)] },
  ])));
  const projectConfigurationError = (message: string) =>
    createError(errorCodes.PROJECT_CONFIGURATION, message);

  function queryDatabase(databasePath: string, operation: (database: Database) => unknown) {
    try {
      return readDatabase(databasePath, operation);
    } catch (error: any) {
      throw databaseError(error);
    }
  }

  function journalPaths(journalPath: string) {
    try {
      return pathsForJournal(journalPath);
    } catch (error: any) {
      throw projectConfigurationError(error.message);
    }
  }

  function ensureCurrent(journalPath: string) {
    const paths = journalPaths(journalPath);
    try {
      fs.mkdirSync(path.dirname(paths.databasePath), { recursive: true, mode: 0o700 });
      const current = { ...paths, ...ensureDatabaseCurrent(paths.databasePath, paths.journalPath) };
      fs.chmodSync(paths.databasePath, 0o600);
      return current;
    } catch (error: any) {
      if (Object.values(errorCodes).includes(error.code)) throw error;
      throw createError(errorCodes.DATABASE, error.message);
    }
  }

  function openJournal(journalPath: string) {
    return journalFromDatabase(ensureCurrent(journalPath));
  }

  function withJournalText(content: string, baseDirectory: string, operation: (journal: ReturnType<typeof journalFromDatabase>) => unknown) {
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

  function journalFromDatabase(current: CurrentJournal) {
    const warnings = groupWarnings(queryDatabase(
      current.databasePath,
      (database: Database) => database.prepare(`
        SELECT code, message, source, line, column,
          start_line AS startLine, end_line AS endLine
        FROM ingestion_warnings
        ORDER BY position
      `).all(),
    ));
    const caches = Object.freeze({ valuationPriceCache: new Map() });
    const operations = Object.fromEntries(queries.map(({ name, execute }: QueryDefinition) => [
      name,
      (options: unknown) => queryDatabase(
        current.databasePath,
        (database: Database) => execute(database, options, caches),
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
