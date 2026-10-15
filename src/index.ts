import type { Journal, LedgerSyntaxTree, ParseLedgerOptions } from './public-api';

const { createRepositoryContainer } = require('@jakobm/portico');

const container = createRepositoryContainer(__dirname, 'modules');
const { openJournal } = container.resolve('project');
const { parseLedgerText } = container.resolve('journal');

type PublicApi = {
  openJournal: (journalPath: string) => Journal;
  parseLedgerText: (sourceText: string, options?: ParseLedgerOptions) => LedgerSyntaxTree;
};

const api: PublicApi = {
  openJournal: openJournal as (journalPath: string) => Journal,
  parseLedgerText: parseLedgerText as (sourceText: string, options?: ParseLedgerOptions) => LedgerSyntaxTree,
};

export = api;
