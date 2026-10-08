'use strict';

// A balance assignment has no commodity and the account's holdings cannot
// identify one. Ordinary Ledger text without that commodity is rejected by
// the parser, so this example removes it from a parsed journal in memory.
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { parse } = resolveRepositoryModule('src/impl/ingestion/syntax/ledger-parser.js');
const { PostingResolver } = resolveRepositoryModule('src/impl/ingestion/accounting/posting-resolver.js');

module.exports = () => {
  const journal = parse(`2024-01-01 Ambiguous assignment
  Assets:Cash  = 10 SEK
  Equity:Opening
`, { source: 'fixture.ledger' });
  const transaction = journal.entries[0];
  transaction.postings[0].balanceAssignment.commodity = null;
  const warnings = [];
  const resolved = new PostingResolver(warnings).resolve(transaction);
  return { resolved, warnings };
};
