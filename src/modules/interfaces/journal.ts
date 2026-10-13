'use strict';

import type { LedgerEntry, LedgerSyntaxTree, ParseLedgerOptions } from '../../public-api';

type WarningLocation = {
  source: string; line: number; column: number; startLine?: number; endLine?: number;
};
type Warning = {
  code: string; message: string; source: string; line: number; column: number;
  startLine: number; endLine: number;
};
type WarningGroup = { code: string; message: string; instances: ReadonlyArray<WarningLocation> };
type WarningCode =
  | 'BALANCE_ASSERTION_FAILED' | 'DUPLICATE_ACCOUNT_DECLARATION'
  | 'DUPLICATE_COMMODITY_DECLARATION' | 'DUPLICATE_TAG_DECLARATION'
  | 'FOREIGN_LOT_COST_CURRENCY' | 'IMPOSSIBLE_COST_BASIS' | 'INVALID_COMMODITY_TRADE'
  | 'MISSING_COMMODITY_FORMAT' | 'MISSING_DEFAULT_COMMODITY'
  | 'MULTIPLE_DEFAULT_COMMODITIES' | 'MULTIPLE_IMPLICIT_POSTINGS'
  | 'NEGATIVE_POSTING_DATE_HOLDING' | 'POSTING_DATE_BEFORE_TRANSACTION'
  | 'RESIDUAL_COST_BASIS' | 'SALE_PROCEEDS_MISMATCH' | 'SYNTAX_ERROR'
  | 'UNBALANCED_TRANSACTION' | 'UNDECLARED_ACCOUNT' | 'UNDECLARED_COMMODITY'
  | 'UNDECLARED_TAG';
type JournalFile = { path: string; sha256: string; size: number };
type JournalManifest = { journalPath: string; files: JournalFile[] };
type LoadedJournal = JournalManifest & { entries: LedgerEntry[]; warnings: Warning[] };
type JournalSource =
  | { kind: 'file'; path: string }
  | { kind: 'text'; content: string; baseDirectory: string; sourceName: string };

type Facade = {
  ingestionWarning: {
    createWarning(code: string, message: string, location: WarningLocation): Warning;
    groupWarnings(warnings: Warning[]): ReadonlyArray<WarningGroup>;
    warningCodes: Readonly<{ [Code in WarningCode]: Code }>;
  };
  loadJournal(source: JournalSource): LoadedJournal;
  loadJournalManifest(journalPath: string): JournalManifest;
  parseStrict(sourceText: string, options?: ParseLedgerOptions, lineOffset?: number): LedgerSyntaxTree;
};
type Registrations = Pick<Facade, 'ingestionWarning'> & {
  journal: Pick<Facade, 'loadJournal'>;
  journalManifest: Pick<Facade, 'loadJournalManifest'>;
  ledgerParser: Pick<Facade, 'parseStrict'>;
};

export = ({
  ingestionWarning, journal: { loadJournal }, journalManifest: { loadJournalManifest },
  ledgerParser: { parseStrict },
}: Registrations): Facade => ({
  ingestionWarning, loadJournal, loadJournalManifest, parseStrict,
});
