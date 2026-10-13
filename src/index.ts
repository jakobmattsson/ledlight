import type { Journal, LedgerSyntaxTree, ParseLedgerOptions } from './public-api';

const { createRepositoryContainer } = require('./composition/repository-container');

const container = createRepositoryContainer(__dirname, 'modules');
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('journal');

type PublicApi = {
  openJournal: (journalPath: string) => Journal;
  parseLedgerText: (sourceText: string, options?: ParseLedgerOptions) => LedgerSyntaxTree;
};

const api: PublicApi = {
  openJournal: openJournal as (journalPath: string) => Journal,
  parseLedgerText: parseStrict as (sourceText: string, options?: ParseLedgerOptions) => LedgerSyntaxTree,
};

export = api;
