'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { queryBalanceHistory: queryBalanceHistoryReport } = resolveRepositoryModule("src/ledlight/queries/balance-history.js");
const { buildDatabase } = resolveRepositoryModule("src/ledlight/sqlite/database.js").$$private;

function buildFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-balance-history-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
commodity NOK
P 2024-01-01 FUND 10 NOK
P 2024-01-01 NOK 1 SEK
P 2024-01-02 NOK 1.1 SEK
P 2024-01-03 FUND 12 NOK
P 2024-01-06 NOK 1.2 SEK

2024-01-01 Buy fund
  Assets:Fund  2 FUND {10 SEK}
  Equity:Opening  -20 SEK

2024-01-02 Add assets
  Assets:Fund  1 FUND {11 SEK}
  Equity:Opening  -11 SEK
  Assets:Cash  5 SEK
  Equity:Opening  -5 SEK

2024-01-03 Internal transfer
  Assets:Cash  10 SEK
  Liabilities:Card  -10 SEK

2024-01-04 Delayed fund sale
  Assets:Fund  -1 FUND {10 SEK} @ 13.2 SEK ; [2024-01-05]
  Equity:Opening  10 SEK
`);
  buildDatabase(databasePath, journalPath);
  return databasePath;
}

test('returns the exact valuation value for each calendar day', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, { accounts: ['Assets:'] }), [
    { date: '2024-01-01', amount: '20', commodity: 'SEK' },
    { date: '2024-01-02', amount: '38', commodity: 'SEK' },
    { date: '2024-01-03', amount: '54.6', commodity: 'SEK' },
    { date: '2024-01-04', amount: '54.6', commodity: 'SEK' },
    { date: '2024-01-05', amount: '41.4', commodity: 'SEK' },
    { date: '2024-01-06', amount: '43.8', commodity: 'SEK' },
  ]);
});

test('nets internal transfers in the daily balance', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    from: '2024-01-03',
    to: '2024-01-03',
    accounts: ['Assets:', 'Liabilities:'],
  }), [{ date: '2024-01-03', amount: '44.6', commodity: 'SEK' }]);
});

test('applies inversion as a public report option', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    from: '2024-01-01',
    to: '2024-01-01',
    accounts: ['Assets:'],
    invert: true,
  }), [{ date: '2024-01-01', amount: '-20', commodity: 'SEK' }]);
});

test('keeps an internal transfer atomic when a posting has another date', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-dated-transfer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-02 Internal transfer
  Assets:Destination  10 SEK
  Assets:Source  -10 SEK ; [2024-01-01]
`);
  buildDatabase(databasePath, journalPath);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    accounts: ['Assets:'],
    dateBasis: 'transaction',
  }), [{ date: '2024-01-02', amount: '0', commodity: 'SEK' }]);
});

test('can use transaction dates instead of posting dates', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    accounts: ['Assets:Fund'],
    dateBasis: 'transaction',
    from: '2024-01-04',
    to: '2024-01-04',
  }), [{ date: '2024-01-04', amount: '26.4', commodity: 'SEK' }]);
});

test('values holdings daily and applies date filters to the output', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    from: '2024-01-02',
    accounts: ['Assets:Fund'],
  }), [
    { date: '2024-01-02', amount: '33', commodity: 'SEK' },
    { date: '2024-01-03', amount: '39.6', commodity: 'SEK' },
    { date: '2024-01-04', amount: '39.6', commodity: 'SEK' },
    { date: '2024-01-05', amount: '26.4', commodity: 'SEK' },
    { date: '2024-01-06', amount: '28.8', commodity: 'SEK' },
  ]);
});

test('also returns balances with exact per-account factors when requested', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(queryBalanceHistoryReport(databasePath, {
    to: '2024-01-03',
    accounts: ['Assets:', 'Liabilities:'],
    accountFactors: {
      'Assets:Fund': '0.5',
      'Liabilities:Card': '0.25',
    },
  }), [
    { date: '2024-01-01', amount: '20', commodity: 'SEK', factoredAmount: '10' },
    { date: '2024-01-02', amount: '38', commodity: 'SEK', factoredAmount: '21.5' },
    { date: '2024-01-03', amount: '44.6', commodity: 'SEK', factoredAmount: '32.3' },
  ]);
});

test('rejects invalid intervals and missing historical prices', (t) => {
  const databasePath = buildFixture(t);
  assert.throws(
    () => queryBalanceHistoryReport(databasePath, { from: '2024-02-30' }),
    /Invalid --from date/u,
  );
  assert.throws(
    () => queryBalanceHistoryReport(databasePath, { from: '2024-02-01', to: '2024-01-01' }),
    /--from date .* is after --to date/u,
  );
  assert.throws(
    () => queryBalanceHistoryReport(databasePath, { accountFactors: { 'Assets:Fund': 'many' } }),
    /Invalid account factor/u,
  );
  assert.throws(
    () => queryBalanceHistoryReport(databasePath, { dateBasis: 'actual' }),
    /Invalid dateBasis/u,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-daily-unpriced-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const unpricedDatabasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-01 Opening
  Assets:Other  1 OTHER {1 SEK}
  Equity:Opening  -1 SEK
`);
  buildDatabase(unpricedDatabasePath, journalPath);
  assert.throws(
    () => queryBalanceHistoryReport(unpricedDatabasePath, { accounts: ['Assets:'] }),
    /No price for OTHER on or before 2024-01-01/u,
  );
});
