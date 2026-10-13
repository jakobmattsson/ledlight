'use strict';

import type { LedgerEntry } from '../../public-api';

type Warning = {
  code: string; message: string; source: string; line: number; column: number;
  startLine: number; endLine: number;
};
type JournalInput = {
  journalPath: string;
  files: Array<{ path: string; sha256: string; size: number }>;
  entries: LedgerEntry[];
  warnings?: Warning[];
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
  database: {
    ensureDatabaseCurrent(databasePath: string, sourceJournalPath: string): {
      rebuilt: boolean; status: DatabaseStatus; summary?: DatabaseSummary;
    };
  };
  databaseReader: { readDatabase<Result>(databasePath: string,
    query: (database: ReadableDatabase) => Result): Result };
  journalWriter: { writeJournalDatabase(databasePath: string, journal: JournalInput): DatabaseSummary };
};

export = ({
  database, databaseReader, journalWriter,
}: Facade): Facade => ({
  database, databaseReader, journalWriter,
});
