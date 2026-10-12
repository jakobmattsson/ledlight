'use strict';

const path = require('node:path');
const { createRepositoryContainer } = require('./composition/repository-container');

const container = createRepositoryContainer(path.resolve(__dirname, 'modules'));
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('journal').ledgerParser;

module.exports = { openJournal, parseLedgerText: parseStrict };
