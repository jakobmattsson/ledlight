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
