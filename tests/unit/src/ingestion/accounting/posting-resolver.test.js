'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/impl/ingestion/syntax/ledger-parser.js");
const { PostingResolver } = resolveRepositoryModule("src/impl/ingestion/accounting/posting-resolver.js");

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

test('balances lot costs against an opposing posting in the cost commodity', () => {
  for (const [cash, expectedImbalance] of [
    ['-100 SEK', null],
    ['-99 SEK', 'Transaction does not balance: 1 SEK'],
    ['-100 USD', null],
  ]) {
    const transaction = parseTransaction(`2024-01-01 Purchase
  Assets:Fund  2 FUND {{100 SEK}}
  Assets:Cash  ${cash}
`);
    const warnings = [];
    new PostingResolver(warnings).resolve(transaction);
    assert.deepEqual(
      warnings.filter(({ code }) => code === 'UNBALANCED_TRANSACTION').map(({ message }) => message),
      expectedImbalance === null ? [] : [expectedImbalance],
      cash,
    );
  }
});

test('balances commodity replacements according to explicit transaction prices', () => {
  const cases = [
    { name: 'neither priced', incomingPrice: '', outgoingPrice: '', imbalance: null },
    { name: 'both priced', incomingPrice: '@@ 350 SEK', outgoingPrice: '@@ 350 SEK', imbalance: null },
    {
      name: 'incoming priced only', incomingPrice: '@@ 350 SEK', outgoingPrice: '',
      imbalance: 'Transaction does not balance: 350 SEK, -1.9619 OLD',
    },
    {
      name: 'outgoing priced only', incomingPrice: '', outgoingPrice: '@@ 350 SEK',
      imbalance: 'Transaction does not balance: 4.051281 NEW, -350 SEK',
    },
  ];
  for (const { name, incomingPrice, outgoingPrice, imbalance } of cases) {
    const transaction = parseTransaction(`2022-12-12 Replacement
  Assets:Shares  4.051281 NEW {{350 SEK}} ${incomingPrice}
  Assets:Shares  -1.9619 OLD {{350 SEK}} ${outgoingPrice}
`);
    const warnings = [];
    new PostingResolver(warnings).resolve(transaction);
    assert.deepEqual(
      warnings.filter(({ code }) => code === 'UNBALANCED_TRANSACTION').map(({ message }) => message),
      imbalance === null ? [] : [imbalance],
      name,
    );
  }
});

test('unpriced commodity replacements do not require equal lot costs', () => {
  const transaction = parseTransaction(`2024-01-01 Replacement
  Assets:Shares  2 NEW {{100 SEK}}
  Assets:Shares  -1 OLD {{99 SEK}}
`);
  const warnings = [];
  new PostingResolver(warnings).resolve(transaction);
  assert.deepEqual(warnings.filter(({ code }) => code === 'UNBALANCED_TRANSACTION'), []);
});
