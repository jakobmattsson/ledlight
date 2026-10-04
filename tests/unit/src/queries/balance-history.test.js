'use strict';

const {
  resolveQuery,
  resolveRepositoryModule,
} = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execute: queryBalanceHistoryReport } = resolveQuery('balanceHistoryReport');
const { buildDatabase } = resolveRepositoryModule("src/ingestion/database/database.js").$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');

function balanceHistoryReport(databasePath, options) {
  return readDatabase(databasePath,
    (database) => queryBalanceHistoryReport(database, options, { valuationPriceCache: new Map() }));
}

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

  assert.deepEqual(balanceHistoryReport(databasePath, { accountFactors: { 'Assets:': '1' } }), [
    { date: '2024-01-01', amount: '20', commodity: 'SEK', factoredAmount: '20' },
    { date: '2024-01-02', amount: '38', commodity: 'SEK', factoredAmount: '38' },
    { date: '2024-01-03', amount: '54.6', commodity: 'SEK', factoredAmount: '54.6' },
    { date: '2024-01-04', amount: '54.6', commodity: 'SEK', factoredAmount: '54.6' },
    { date: '2024-01-05', amount: '41.4', commodity: 'SEK', factoredAmount: '41.4' },
    { date: '2024-01-06', amount: '43.8', commodity: 'SEK', factoredAmount: '43.8' },
  ]);
});

test('nets internal transfers in the daily balance', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(balanceHistoryReport(databasePath, {
    from: '2024-01-03',
    to: '2024-01-03',
    accountFactors: { 'Assets:': '1', 'Liabilities:': '1' },
  }), [{ date: '2024-01-03', amount: '44.6', commodity: 'SEK', factoredAmount: '44.6' }]);
});

test('applies inversion as a public report option', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(balanceHistoryReport(databasePath, {
    from: '2024-01-01',
    to: '2024-01-01',
    accountFactors: { 'Assets:': '1' },
    invert: true,
  }), [{
    date: '2024-01-01', amount: '-20', commodity: 'SEK', factoredAmount: '-20',
  }]);
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

  assert.deepEqual(balanceHistoryReport(databasePath, {
    accountFactors: { 'Assets:': '1' },
    dateBasis: 'transaction',
  }), [{ date: '2024-01-02', amount: '0', commodity: 'SEK', factoredAmount: '0' }]);
});

test('can use transaction dates instead of posting dates', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(balanceHistoryReport(databasePath, {
    accountFactors: { 'Assets:Fund': '1' },
    dateBasis: 'transaction',
    from: '2024-01-04',
    to: '2024-01-04',
  }), [{ date: '2024-01-04', amount: '26.4', commodity: 'SEK', factoredAmount: '26.4' }]);
});

test('values holdings daily and applies date filters to the output', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(balanceHistoryReport(databasePath, {
    from: '2024-01-02',
    accountFactors: { 'Assets:Fund': '1' },
  }), [
    { date: '2024-01-02', amount: '33', commodity: 'SEK', factoredAmount: '33' },
    { date: '2024-01-03', amount: '39.6', commodity: 'SEK', factoredAmount: '39.6' },
    { date: '2024-01-04', amount: '39.6', commodity: 'SEK', factoredAmount: '39.6' },
    { date: '2024-01-05', amount: '26.4', commodity: 'SEK', factoredAmount: '26.4' },
    { date: '2024-01-06', amount: '28.8', commodity: 'SEK', factoredAmount: '28.8' },
  ]);
});

test('also returns balances with per-pattern account factors when requested', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(balanceHistoryReport(databasePath, {
    to: '2024-01-03',
    accountFactors: {
      '^Assets:Fund$': '0.5',
      '^Assets:Cash$': '1',
      '^Liabilities': '0.25',
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
    () => balanceHistoryReport(databasePath, { from: '2024-02-30' }),
    /Invalid --from date/u,
  );
  assert.throws(
    () => balanceHistoryReport(databasePath, { from: '2024-02-01', to: '2024-01-01' }),
    /--from date .* is after --to date/u,
  );
  assert.throws(
    () => balanceHistoryReport(databasePath, { accountFactors: { 'Assets:Fund': 'many' } }),
    /Invalid account factor/u,
  );
  assert.throws(
    () => balanceHistoryReport(databasePath, { dateBasis: 'actual' }),
    /Invalid dateBasis/u,
  );
  assert.throws(
    () => balanceHistoryReport(databasePath, { accounts: ['Assets:'] }),
    /Unknown balanceHistoryReport option: accounts/u,
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
    () => balanceHistoryReport(unpricedDatabasePath, { accountFactors: { 'Assets:': '1' } }),
    /No price for OTHER on or before 2024-01-01/u,
  );
});
