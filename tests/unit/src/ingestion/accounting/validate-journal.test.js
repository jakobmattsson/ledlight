'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const {
  validateJournal,
} = resolveRepositoryModule("src/ingestion/accounting/journal-validator.js");
const { JournalValidationError } = resolveRepositoryModule(
  "src/ingestion/accounting/journal-validator.js",
).$$private;

const invalidAmounts = [
  {
    name: 'posting amounts',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].amount.commodity = null; },
    message: /fixture\.ledger:2:3: Posting amount must specify a commodity/u,
  },
  {
    name: 'lot costs',
    source: `2024-01-01 Missing commodity
  Assets:Fund  1 FUND {10 SEK}
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].lotCost.amount.commodity = null; },
    message: /fixture\.ledger:2:3: Lot cost must specify a commodity/u,
  },
  {
    name: 'posting costs',
    source: `2024-01-01 Missing commodity
  Assets:Fund  1 FUND @ 10 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].cost.amount.commodity = null; },
    message: /fixture\.ledger:2:3: Posting cost must specify a commodity/u,
  },
  {
    name: 'balance assertions',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1 SEK = 1 SEK
  Equity:Opening
`,
    invalidate: (journal) => { journal.entries[0].postings[0].balanceAssertion.commodity = null; },
    message: /fixture\.ledger:2:3: Balance assertion must specify a commodity/u,
  },
  {
    name: 'prices',
    source: 'P 2024-01-01 FUND 10 SEK\n',
    invalidate: (journal) => { journal.entries[0].price.commodity = null; },
    message: /fixture\.ledger:1:1: Price must specify a commodity/u,
  },
];

for (const fixture of invalidAmounts) {
  test(`rejects commodity-less ${fixture.name}`, () => {
    const journal = parse(fixture.source, { source: 'fixture.ledger' });
    fixture.invalidate(journal);
    assert.throws(
      () => validateJournal(journal),
      (error) => error instanceof JournalValidationError && fixture.message.test(error.message),
    );
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

  assert.equal(validateJournal(journal), journal);
});

function parseTrade(posting) {
  return parse(`commodity SEK
  default
2024-01-01 Trade
  Assets:Fund  ${posting}
  Equity:Opening
`, { source: 'fixture.ledger' });
}

test('requires positive non-default commodity postings to use only a lot cost', () => {
  for (const posting of ['1 FUND', '1 FUND @ 10 SEK', '1 FUND {10 SEK} @ 10 SEK']) {
    assert.throws(
      () => validateJournal(parseTrade(posting)),
      (error) => error instanceof JournalValidationError &&
        /fixture\.ledger:4:3: Positive FUND posting must use a lot cost .* and no transaction price .* default commodity is SEK/u.test(error.message),
    );
  }

  assert.doesNotThrow(() => validateJournal(parseTrade('1 FUND {10 SEK}')));
  assert.doesNotThrow(() => validateJournal(parseTrade('1 FUND {{10 SEK}}')));
});

test('requires negative non-default commodity postings to use lot cost and transaction price', () => {
  for (const posting of ['-1 FUND', '-1 FUND {10 SEK}', '-1 FUND @ 12 SEK']) {
    assert.throws(
      () => validateJournal(parseTrade(posting)),
      (error) => error instanceof JournalValidationError &&
        /fixture\.ledger:4:3: Negative FUND posting must use both a lot cost .* and a transaction price .* default commodity is SEK/u.test(error.message),
    );
  }

  assert.doesNotThrow(() => validateJournal(parseTrade('-1 FUND {10 SEK} @ 12 SEK')));
  assert.doesNotThrow(() => validateJournal(parseTrade('-1 FUND {{10 SEK}} @@ 12 SEK')));
});

test('does not apply the trade annotation rule to default commodities or zero quantities', () => {
  assert.doesNotThrow(() => validateJournal(parseTrade('0 FUND')));
  assert.doesNotThrow(() => validateJournal(parseTrade('1 SEK')));
  assert.doesNotThrow(() => validateJournal(parseTrade('-1 SEK')));
});
