'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const { PostingResolver } = resolveRepositoryModule("src/ingestion/accounting/posting-resolver.js");

function parseTransaction(sourceText) {
  return parse(sourceText, { source: 'fixture.ledger' }).entries[0];
}

function resolveWithWarnings(transaction) {
  const warnings = [];
  const result = new PostingResolver(warnings).resolve(transaction);
  return { result, warnings };
}

test('resolves one implicit posting for every explicit commodity', () => {
  const transaction = parseTransaction(`2024-01-01 Opening
  Assets:Cash  10 SEK
  Assets:Fund  2 FUND
  Equity:Opening
`);

  assert.deepEqual(new PostingResolver().resolve(transaction), [
    [{ quantity: '10', commodity: 'SEK' }],
    [{ quantity: '2', commodity: 'FUND' }],
    [
      { quantity: '-10', commodity: 'SEK' },
      { quantity: '-2', commodity: 'FUND' },
    ],
  ]);
});

test('warns about explicitly unbalanced transactions and keeps their amounts', () => {
  const transaction = parseTransaction(`2024-01-01 Unbalanced
  Assets:Cash  1 SEK
  Equity:Opening  2 SEK
`);

  const { result, warnings } = resolveWithWarnings(transaction);
  assert.equal(result.length, 2);
  assert.equal(warnings[0].code, 'UNBALANCED_TRANSACTION');
  assert.match(warnings[0].message, /does not balance.*3 SEK/u);
});

test('accepts explicitly balanced transactions with multiple commodities', () => {
  const transaction = parseTransaction(`2024-01-01 Balanced
  Assets:Cash  1 SEK
  Equity:Opening  -1 SEK
  Assets:Fund  2 FUND
  Equity:Opening  -2 FUND
`);

  assert.doesNotThrow(() => new PostingResolver().resolve(transaction));
});

test('accepts two-commodity exchanges with opposite signs', () => {
  const transaction = parseTransaction(`2024-01-01 Exchange
  Assets:Cash  -100 SEK
  Assets:Fund  2 FUND
`);

  assert.doesNotThrow(() => new PostingResolver().resolve(transaction));
});

test('warns about two-commodity postings with the same sign', () => {
  const transaction = parseTransaction(`2024-01-01 Not an exchange
  Assets:Cash  100 SEK
  Assets:Fund  2 FUND
`);

  assert.match(resolveWithWarnings(transaction).warnings[0].message, /100 SEK, 2 FUND/u);
});

test('accepts correctly balanced costed transactions', () => {
  const transaction = parseTransaction(`2024-01-01 Costed purchase
  Assets:Fund  1 FUND @ 10 SEK
  Assets:Cash  -10 SEK
`);

  assert.doesNotThrow(() => new PostingResolver().resolve(transaction));
});

test('balances a sale at unit lot cost and requires the realized gain posting', () => {
  const balanced = parseTransaction(`2024-01-01 Sale
  Assets:Fund  -10 FUND {100 SEK} @ 120 SEK
  Assets:Cash  1200 SEK
  Income:Capital Gains  -200 SEK
`);
  assert.doesNotThrow(() => new PostingResolver().resolve(balanced));

  const missingGain = parseTransaction(`2024-01-01 Sale
  Assets:Fund  -10 FUND {100 SEK} @ 120 SEK
  Assets:Cash  1200 SEK
`);
  assert.match(resolveWithWarnings(missingGain).warnings[0].message, /200 SEK/u);
});

test('balances a sale at total lot cost', () => {
  const transaction = parseTransaction(`2024-01-01 Sale
  Assets:Fund  -10 FUND {{1000 SEK}} @@ 1200 SEK
  Assets:Cash  1200 SEK
  Income:Capital Gains  -200 SEK
`);

  assert.doesNotThrow(() => new PostingResolver().resolve(transaction));
});

test('allows calculated unit-cost residuals within explicit amount precision', () => {
  const transaction = parseTransaction(`2024-01-01 Rounded cost
  Assets:Fund  1.234 FUND @ 2.00 SEK
  Assets:Cash  -2.47 SEK
`);

  assert.doesNotThrow(() => new PostingResolver().resolve(transaction));
});

test('warns about calculated unit-cost residuals outside explicit amount precision', () => {
  const transaction = parseTransaction(`2024-01-01 Incorrect cost
  Assets:Fund  1.234 FUND @ 2.00 SEK
  Assets:Cash  -2.48 SEK
`);

  assert.match(resolveWithWarnings(transaction).warnings[0].message, /-0\.012 SEK/u);
});

test('does not treat residuals from a costed posting as a commodity exchange', () => {
  const transaction = parseTransaction(`2024-01-01 Mixed cost and exchange
  Assets:Fund  1 FUND @ 10 SEK
  Assets:Cash  -9 SEK
  Assets:Other  -1 USD
`);

  assert.match(resolveWithWarnings(transaction).warnings[0].message, /1 SEK, -1 USD/u);
});

test('does not apply cost tolerance to ordinary explicit amounts', () => {
  const transaction = parseTransaction(`2024-01-01 Unbalanced
  Assets:Cash  1 SEK
  Equity:Opening  -0.6 SEK
`);

  assert.match(resolveWithWarnings(transaction).warnings[0].message, /0\.4 SEK/u);
});

test('warns about a failed balance assertion and retains the transaction', () => {
  const transaction = parseTransaction(`2024-01-01 Incorrect assertion
  Assets:Cash  10 SEK = 11 SEK
  Equity:Opening
`);

  const { result, warnings } = resolveWithWarnings(transaction);
  assert.equal(result.length, 2);
  assert.equal(warnings[0].code, 'BALANCE_ASSERTION_FAILED');
  assert.match(warnings[0].message, /expected 11 SEK, got 10 SEK/u);
});

test('warns and skips transactions with multiple implicit postings', () => {
  const transaction = parseTransaction(`2024-01-01 Ambiguous
  Assets:Cash
  Equity:Opening
`);

  const { result, warnings } = resolveWithWarnings(transaction);
  assert.equal(result, null);
  assert.equal(warnings[0].code, 'MULTIPLE_IMPLICIT_POSTINGS');
});

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
