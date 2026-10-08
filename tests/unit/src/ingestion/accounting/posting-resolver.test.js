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

for (const cost of ['{2.00 SEK}', '@ 2.00 SEK', '{{2.468 SEK}}', '@@ 2.468 SEK']) {
  test(`warns about a sub-cent residual with exact cost ${cost}`, () => {
    const transaction = parseTransaction(`2024-01-01 Rounded payment
  Assets:Fund  1.234 FUND ${cost}
  Assets:Cash  -2.47 SEK
`);

    const { result, warnings } = resolveWithWarnings(transaction);
    assert.equal(result[1][0].quantity, '-2.47');
    assert.deepEqual(warnings.map(({ code, message }) => ({ code, message })), [{
      code: 'UNBALANCED_TRANSACTION',
      message: 'Transaction does not balance: -0.002 SEK',
    }]);
  });

  test(`balances exact cost ${cost} with an explicit rounding posting`, () => {
    const transaction = parseTransaction(`2024-01-01 Rounded payment
  Assets:Fund  1.234 FUND ${cost}
  Assets:Cash  -2.47 SEK
  Expenses:Rounding  0.002 SEK
`);

    assert.deepEqual(resolveWithWarnings(transaction).warnings, []);
  });

  test(`assigns the full residual of exact cost ${cost} to an implicit posting`, () => {
    const transaction = parseTransaction(`2024-01-01 Rounded payment
  Assets:Fund  1.234 FUND ${cost}
  Assets:Cash  -2.47 SEK
  Expenses:Rounding
`);

    const { result, warnings } = resolveWithWarnings(transaction);
    assert.deepEqual(warnings, []);
    assert.deepEqual(result[2], [{ quantity: '0.002', commodity: 'SEK' }]);
  });
}

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
