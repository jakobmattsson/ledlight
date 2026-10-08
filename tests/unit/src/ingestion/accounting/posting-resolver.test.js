'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/impl/ingestion/syntax/ledger-parser.js");
const { PostingResolver } = resolveRepositoryModule("src/impl/ingestion/accounting/posting-resolver.js");

function parseTransaction(sourceText) {
  return parse(sourceText, { source: 'fixture.ledger' }).entries[0];
}

function resolveWithWarnings(transaction) {
  const warnings = [];
  const result = new PostingResolver(warnings).resolve(transaction);
  return { result, warnings };
}

test('warns and skips transactions with an ambiguous balance assignment commodity', () => {
  const transaction = parseTransaction(`2024-01-01 Ambiguous assignment
  Assets:Cash  = 10 SEK
  Equity:Opening
`);
  transaction.postings[0].balanceAssignment.commodity = null;

  const { result, warnings } = resolveWithWarnings(transaction);
  assert.equal(result, null);
  assert.equal(warnings[0].code, 'AMBIGUOUS_BALANCE_ASSIGNMENT');
});
