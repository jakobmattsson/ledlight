'use strict';

const { createRepositoryContainer } = require('./impl/composition/repository-container');

const container = createRepositoryContainer();
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('ledgerParser');

module.exports = { openJournal, parseLedgerText: parseStrict };
