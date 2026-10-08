'use strict';

// A parsed amount lacks a commodity, making its entry unstoreable. Ordinary
// Ledger text without that commodity is rejected by the parser, so this
// example removes it from a parsed journal in memory.
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { parse } = resolveRepositoryModule('src/impl/ingestion/syntax/ledger-parser.js');
const { validateJournal } = resolveRepositoryModule('src/impl/ingestion/accounting/journal-validator.js');

module.exports = () => {
  const journal = parse(`commodity SEK
  format 1,000.00 SEK
account Assets:Cash
account Equity:Opening
2024-01-01 Missing commodity
  Assets:Cash  1 SEK
  Equity:Opening
`, { source: 'fixture.ledger' });
  journal.entries.at(-1).postings[0].amount.commodity = null;
  const { invalidEntries, warnings } = validateJournal(journal);
  return { invalidEntries, warnings };
};
