'use strict';

type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'text'; content: string; baseDirectory: string; sourceName: string };
type Warning = {
  code: string; message: string; source: string; line: number; column: number;
  startLine: number; endLine: number;
};
type DatabaseSummary = {
  databasePath: string;
  journalPath: string;
  files: number;
  entries: number;
  transactions: number;
  postings: number;
  postingAmounts: number;
  postingBalances: number;
  prices: number;
  valuationCommodity: string | null;
  valuationPrices: number;
  warnings: Warning[];
};
type DatabaseStatus = {
  databasePath: string;
  journalPath: string;
  inSync: boolean;
  reason: string;
  added: string[];
  removed: string[];
  changed: string[];
};
type ReadableDatabase = {
  prepare(sql: string): {
    all(...parameters: unknown[]): unknown[];
    get(...parameters: unknown[]): unknown;
  };
};
type Facade = {
  prepareDatabase(databasePath: string, source: JournalSource): {
    rebuilt: boolean; status: DatabaseStatus; summary?: DatabaseSummary;
  };
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
  // Reuse a current file cache or build a database from a file or text source.
  prepareDatabase,
  // Run a query against an existing database through a read-only connection.
  readDatabase,
});
