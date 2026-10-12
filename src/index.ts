import type { Journal, LedgerSyntaxTree, ParseLedgerOptions } from './public-api';

const { createRepositoryContainer } = require('./composition/repository-container');

const container = createRepositoryContainer(__dirname, 'modules');
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('journal').ledgerParser;

const api = {
  openJournal: openJournal as (journalPath: string) => Journal,
  parseLedgerText: parseStrict as (sourceText: string, options?: ParseLedgerOptions) => LedgerSyntaxTree,
};

export = api;
