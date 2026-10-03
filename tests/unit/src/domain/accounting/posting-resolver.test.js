'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/ingestion/syntax/parser.js");
const { PostingResolver } = resolveRepositoryModule("src/domain/accounting/posting-resolver.js");

function parseTransaction(sourceText) {
  return parse(sourceText, { source: 'fixture.ledger' }).entries[0];
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

test('rejects explicitly unbalanced transactions', () => {
  const transaction = parseTransaction(`2024-01-01 Unbalanced
  Assets:Cash  1 SEK
  Equity:Opening  2 SEK
`);

  assert.throws(
    () => new PostingResolver().resolve(transaction),
    /fixture\.ledger:1.*does not balance.*3 SEK/u,
  );
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

test('rejects two-commodity postings with the same sign', () => {
  const transaction = parseTransaction(`2024-01-01 Not an exchange
  Assets:Cash  100 SEK
  Assets:Fund  2 FUND
`);

  assert.throws(
    () => new PostingResolver().resolve(transaction),
    /fixture\.ledger:1.*does not balance.*100 SEK, 2 FUND/u,
  );
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
  assert.throws(
    () => new PostingResolver().resolve(missingGain),
    /fixture\.ledger:1.*does not balance.*200 SEK/u,
  );
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

test('rejects calculated unit-cost residuals outside explicit amount precision', () => {
  const transaction = parseTransaction(`2024-01-01 Incorrect cost
  Assets:Fund  1.234 FUND @ 2.00 SEK
  Assets:Cash  -2.48 SEK
`);

  assert.throws(
    () => new PostingResolver().resolve(transaction),
    /fixture\.ledger:1.*does not balance.*-0\.012 SEK/u,
  );
});

test('does not treat residuals from a costed posting as a commodity exchange', () => {
  const transaction = parseTransaction(`2024-01-01 Mixed cost and exchange
  Assets:Fund  1 FUND @ 10 SEK
  Assets:Cash  -9 SEK
  Assets:Other  -1 USD
`);

  assert.throws(
    () => new PostingResolver().resolve(transaction),
    /fixture\.ledger:1.*does not balance.*1 SEK, -1 USD/u,
  );
});

test('does not apply cost tolerance to ordinary explicit amounts', () => {
  const transaction = parseTransaction(`2024-01-01 Unbalanced
  Assets:Cash  1 SEK
  Equity:Opening  -0.6 SEK
`);

  assert.throws(
    () => new PostingResolver().resolve(transaction),
    /fixture\.ledger:1.*does not balance.*0\.4 SEK/u,
  );
});
