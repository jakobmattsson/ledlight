'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/ledlight/syntax/parser.js");
const {
  validateJournal,
} = resolveRepositoryModule("src/ledlight/accounting/validate-journal.js");
const { JournalValidationError } = resolveRepositoryModule(
  "src/ledlight/accounting/validate-journal.js",
).$$private;

const invalidAmounts = [
  {
    name: 'posting amounts',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1
  Equity:Opening
`,
    message: /fixture\.ledger:2:3: Posting amount must specify a commodity/u,
  },
  {
    name: 'posting costs',
    source: `2024-01-01 Missing commodity
  Assets:Fund  1 FUND @ 10
  Equity:Opening
`,
    message: /fixture\.ledger:2:3: Posting cost must specify a commodity/u,
  },
  {
    name: 'balance assertions',
    source: `2024-01-01 Missing commodity
  Assets:Cash  1 SEK = 1
  Equity:Opening
`,
    message: /fixture\.ledger:2:3: Balance assertion must specify a commodity/u,
  },
  {
    name: 'prices',
    source: 'P 2024-01-01 FUND 10\n',
    message: /fixture\.ledger:1:1: Price must specify a commodity/u,
  },
];

for (const fixture of invalidAmounts) {
  test(`rejects commodity-less ${fixture.name}`, () => {
    const journal = parse(fixture.source, { source: 'fixture.ledger' });
    assert.throws(
      () => validateJournal(journal),
      (error) => error instanceof JournalValidationError && fixture.message.test(error.message),
    );
  });
}

test('allows implicit postings and balance-assignment commodity inference', () => {
  const journal = parse(`2024-01-01 Opening
  Assets:Cash  1 SEK
  Equity:Opening
2024-01-02 Assignment
  Assets:Cash  = 2
  Equity:Opening
`, { source: 'fixture.ledger' });

  assert.equal(validateJournal(journal), journal);
});
