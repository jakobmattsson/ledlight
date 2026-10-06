'use strict';

const { createRepositoryContainer } = require('./src/composition/repository-container');

const container = createRepositoryContainer();
const { openJournal } = container.resolve('project');
const { parseStrict } = container.resolve('ledgerParser');

function parseLedgerText(sourceText, options) {
  return parseStrict(sourceText, options);
}

module.exports = { openJournal, parseLedgerText };
