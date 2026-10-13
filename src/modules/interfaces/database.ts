'use strict';

type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'stdin'; content: string; baseDirectory: string };
type ReadableDatabase = {
  prepare(sql: string): {
    all(...parameters: unknown[]): unknown[];
    get(...parameters: unknown[]): unknown;
  };
};
type Facade = {
  prepareDatabase(databasePath: string, source: JournalSource): { journalPath: string };
  readDatabase<Result>(databasePath: string, query: (database: ReadableDatabase) => Result): Result;
};
type Registrations = {
  database: Pick<Facade, 'prepareDatabase'>;
  databaseReader: Pick<Facade, 'readDatabase'>;
};

export = ({
  database: { prepareDatabase },
  databaseReader: { readDatabase },
}: Registrations): Facade => ({
  // Reuse a current file cache or build a database from a file or stdin.
  prepareDatabase,
  // Run a query against an existing database through a read-only connection.
  readDatabase,
});
