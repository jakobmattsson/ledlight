'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = resolveRepositoryModule("src/impl/ingestion/syntax/ledger-parser.js");
const {
  validateJournal,
} = resolveRepositoryModule("src/impl/ingestion/accounting/journal-validator.js");

test('warns about duplicate declarations and marks the later entries unstoreable', () => {
  const journal = parse(`account Assets:Cash
account Assets:Cash
commodity SEK
  format 1,000.00 SEK
  default
commodity SEK
tag Reviewed
tag Reviewed
`, { source: 'fixture.ledger' });

  const result = validateJournal(journal);
  assert.deepEqual(result.warnings.map(({ code, line }) => ({ code, line })), [{
    code: 'DUPLICATE_ACCOUNT_DECLARATION', line: 2,
  }, {
    code: 'DUPLICATE_COMMODITY_DECLARATION', line: 6,
  }, {
    code: 'DUPLICATE_TAG_DECLARATION', line: 8,
  }]);
  assert.deepEqual([...result.invalidEntries], [
    journal.entries[1], journal.entries[3], journal.entries[5],
  ]);
});

test('allows implicit postings and balance assignments', () => {
  const journal = parse(`commodity SEK
  format 1,000.00 SEK
  default
account Assets:Cash
account Equity:Opening
2024-01-01 Opening
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
  format 1,000.00 SEK
  default
commodity FUND
  format 1000.00 FUND
account Assets:Fund
account Equity:Opening
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

test('warns about foreign lot cost currencies without discarding the transaction', () => {
  for (const annotation of ['{10 USD}', '{{10 USD}}']) {
    for (const amount of [`1 FUND ${annotation}`, `-1 FUND ${annotation} @ 12 USD`]) {
      const journal = parseTrade(amount);
      const result = validateJournal(journal);
      assert.deepEqual(result.warnings.filter(({ code }) => code === 'FOREIGN_LOT_COST_CURRENCY'), [{
        code: 'FOREIGN_LOT_COST_CURRENCY',
        message: 'Assets:Fund: lot cost in USD must be expressed in the default commodity SEK. ' +
          'Unrealized gains omit affected positions; their totals may be incomplete',
        source: 'fixture.ledger',
        line: 9,
        column: 3,
        startLine: 9,
        endLine: 9,
      }]);
      assert.equal(result.invalidEntries.size, 0);
    }
  }
});
test('warns when a cost in the posting commodity changes its nominal value', () => {
  for (const posting of [
    '100 SEK {2 SEK}', '100 SEK {{200 SEK}}',
    '100 SEK @ 2 SEK', '100 SEK @@ 200 SEK',
    '-100 SEK {2 SEK}', '-100 SEK {{200 SEK}}', '-100 SEK {{-200 SEK}}',
    '-100 SEK @ 2 SEK', '-100 SEK @@ 200 SEK',
    '100 SEK {0 SEK}', '100 SEK {-1 SEK}',
    '100 SEK {1.000000000000000001 SEK}',
    '0 SEK {2 SEK}', '0 SEK {{1 SEK}}',
    '100 FUND {2 FUND}',
  ]) {
    const result = validateJournal(parseTrade(posting));
    assert.deepEqual(result.warnings.map(({ code }) => code), posting === '100 FUND {2 FUND}'
      ? ['FOREIGN_LOT_COST_CURRENCY', 'INVALID_COMMODITY_TRADE']
      : ['INVALID_COMMODITY_TRADE'], posting);
    const warning = result.warnings.find(({ code }) => code === 'INVALID_COMMODITY_TRADE');
    assert.match(warning.message, /must value one (SEK|FUND) at exactly one \1/u);
    assert.equal(warning.line, 9, posting);
  }
});

test('allows nominal costs on the default commodity and default-currency costs on other commodities', () => {
  for (const posting of [
    '100 SEK {1.00 SEK}', '100 SEK {{100.00 SEK}}',
    '-100 SEK {1 SEK}', '-100 SEK {{100 SEK}}', '-100 SEK {{-100 SEK}}',
    '100 SEK @ 1 SEK', '100 SEK @@ 100 SEK',
    '-100 SEK @ 1 SEK', '-100 SEK @@ 100 SEK', '-100 SEK @@ -100 SEK',
    '0 SEK {1 SEK}', '0 SEK {{0 SEK}}',
    '100 FUND {2 SEK}',
  ]) {
    assert.deepEqual(validateJournal(parseTrade(posting)).warnings, [], posting);
  }
});

test('warns when a default-commodity posting has a cost in another commodity', () => {
  for (const [posting, label] of [
    ['100 SEK {2 FUND}', 'lot cost'],
    ['100 SEK {{200 FUND}}', 'lot cost'],
    ['100 SEK @ 2 FUND', 'transaction price'],
    ['100 SEK @@ 200 FUND', 'transaction price'],
  ]) {
    const result = validateJournal(parseTrade(posting));
    assert.deepEqual(result.warnings.map(({ code }) => code), ['INVALID_COMMODITY_TRADE']);
    assert.equal(result.warnings[0].message,
      `A SEK posting cannot have a ${label} in FUND. ` +
        'Amounts in the default commodity are valued at face value.');
  }
});
