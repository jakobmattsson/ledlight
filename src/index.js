'use strict';

const { createRepositoryContainer } = require('./composition/repository-container');

const container = createRepositoryContainer(__dirname, 'modules');
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('journal').ledgerParser;

module.exports = { openJournal, parseLedgerText: parseStrict };
