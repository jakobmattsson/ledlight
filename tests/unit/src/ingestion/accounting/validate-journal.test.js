'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const {
  validateJournal,
} = resolveRepositoryModule("src/ingestion/accounting/journal-validator.js");

const invalidAmounts = [
  {
    name: 'posting amounts',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].amount.commodity = null; },
    message: 'Posting amount must specify a commodity',
  },
  {
    name: 'lot costs',
    source: `2024-01-01 Missing commodity
  Assets:Fund  1 FUND {10 SEK}
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].lotCost.amount.commodity = null; },
    message: 'Lot cost must specify a commodity',
  },
  {
    name: 'posting costs',
    source: `2024-01-01 Missing commodity
  Assets:Fund  1 FUND @ 10 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].cost.amount.commodity = null; },
    message: 'Posting cost must specify a commodity',
  },
  {
    name: 'balance assertions',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1 SEK = 1 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].balanceAssertion.commodity = null; },
    message: 'Balance assertion must specify a commodity',
  },
  {
    name: 'prices',
    source: 'P 2024-01-01 FUND 10 SEK\n',
    invalidate: (journal) => { journal.entries[0].price.commodity = null; },
    message: 'Price must specify a commodity',
  },
];

for (const fixture of invalidAmounts) {
  test(`warns about commodity-less ${fixture.name} and marks its entry unstoreable`, () => {
    const journal = parse(fixture.source, { source: 'fixture.ledger' });
    fixture.invalidate(journal);
    const result = validateJournal(journal);
    assert.deepEqual(result.warnings, [{
      code: 'MISSING_COMMODITY',
      message: fixture.message,
      source: 'fixture.ledger',
      line: fixture.name === 'prices' ? 1 : 2,
      column: fixture.name === 'prices' ? 1 : 3,
      startLine: fixture.name === 'prices' ? 1 : 2,
      endLine: fixture.name === 'prices' ? 1 : 2,
    }]);
    assert.deepEqual([...result.invalidEntries], [journal.entries[0]]);
  });
}

test('allows implicit postings and balance assignments', () => {
  const journal = parse(`2024-01-01 Opening
  Assets:Cash  1 SEK
  Equity:Opening
2024-01-02 Assignment
  Assets:Cash  = 2 SEK
  Equity:Opening
`, { source: 'fixture.ledger' });

  const result = validateJournal(journal);
  assert.equal(result.journal, journal);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual([...result.invalidEntries], []);
});

function parseTrade(posting) {
  return parse(`commodity SEK
  default
2024-01-01 Trade
  Assets:Fund  ${posting}
  Equity:Opening
`, { source: 'fixture.ledger' });
}

test('warns when positive non-default commodity postings do not use only a lot cost', () => {
  for (const posting of [
    '1 FUND',
    '1 FUND @ 10 SEK',
    '1 FUND {10 SEK} @ 10 SEK',
    '1 FUND {0 SEK} @ 10 SEK',
    '1 FUND {10 SEK} @ 0 SEK',
  ]) {
    const result = validateJournal(parseTrade(posting));
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].code, 'INVALID_COMMODITY_TRADE');
    assert.match(result.warnings[0].message, /Positive FUND posting must use a lot cost .* default commodity is SEK/u);
  }

  assert.deepEqual(validateJournal(parseTrade('1 FUND {10 SEK}')).warnings, []);
  assert.deepEqual(validateJournal(parseTrade('1 FUND {{10 SEK}}')).warnings, []);
});

test('allows positive non-default commodity postings with zero lot and transaction prices', () => {
  assert.deepEqual(validateJournal(parseTrade('1 FUND {0 SEK} @ 0 SEK')).warnings, []);
  assert.deepEqual(validateJournal(parseTrade('1 FUND {{0 SEK}} @@ 0 SEK')).warnings, []);
});

test('warns when negative non-default commodity postings omit lot cost or transaction price', () => {
  for (const posting of ['-1 FUND', '-1 FUND {10 SEK}', '-1 FUND @ 12 SEK']) {
    const result = validateJournal(parseTrade(posting));
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].code, 'INVALID_COMMODITY_TRADE');
    assert.match(result.warnings[0].message, /Negative FUND posting must use both a lot cost .* default commodity is SEK/u);
  }

  assert.deepEqual(validateJournal(parseTrade('-1 FUND {10 SEK} @ 12 SEK')).warnings, []);
  assert.deepEqual(validateJournal(parseTrade('-1 FUND {{10 SEK}} @@ 12 SEK')).warnings, []);
});

test('does not apply the trade annotation rule to default commodities or zero quantities', () => {
  assert.deepEqual(validateJournal(parseTrade('0 FUND')).warnings, []);
  assert.deepEqual(validateJournal(parseTrade('1 SEK')).warnings, []);
  assert.deepEqual(validateJournal(parseTrade('-1 SEK')).warnings, []);
});
