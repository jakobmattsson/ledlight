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
const { execute: queryAggregate } = resolveQuery('aggregate');
const { buildDatabase } = resolveRepositoryModule("src/ingestion/database/database.js").$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');

function aggregate(databasePath, options, caches) {
  const queryCaches = caches ?? { valuationPriceCache: new Map() };
  return readDatabase(databasePath,
    (database) => queryAggregate(database, options, queryCaches));
}

function buildFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-aggregate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
commodity FUND
commodity NOK
P 2024-01-01 FUND 10 SEK
P 2024-01-02 FUND 12 NOK
P 2024-01-02 NOK 1.1 SEK

2024-01-01 Opening
  Assets:Cash  100.000000000000000001 SEK
  Assets:Fund  2 FUND {10 SEK}
  Equity:Opening

2024-01-02 Adjust cash
  Assets:Cash  = 150 SEK
  Equity:Opening

2024-01-03 Future
  Assets:Cash  1000 SEK
  Equity:Opening
`);
  buildDatabase(databasePath, journalPath);
  return databasePath;
}

test('aggregates exact amounts through an inclusive upper date', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, { to: '2024-01-01' }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '100.000000000000000001' },
    { account: 'Assets:Fund', commodity: 'FUND', quantity: '2' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-120.000000000000000001' },
  ]);
  assert.deepEqual(aggregate(databasePath, { to: '2024-01-02' }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '150' },
    { account: 'Assets:Fund', commodity: 'FUND', quantity: '2' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-170' },
  ]);
});

test('supports open and closed date intervals', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, { from: '2024-01-02', to: '2024-01-02' }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '49.999999999999999999' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-49.999999999999999999' },
  ]);
  assert.deepEqual(aggregate(databasePath, { from: '2024-01-02' }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '1049.999999999999999999' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-1049.999999999999999999' },
  ]);
  assert.deepEqual(aggregate(databasePath, {}), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '1150' },
    { account: 'Assets:Fund', commodity: 'FUND', quantity: '2' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-1170' },
  ]);
});

test('combines literal account patterns with OR and supports anchors', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Cash$', '^Equity:'],
  }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '150' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-170' },
  ]);
  assert.deepEqual(aggregate(databasePath, { accounts: ['Assets:%'] }), []);
});

test('can group matching accounts by commodity', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Assets:'],
    groupBy: 'commodity',
  }), [
    { commodity: 'FUND', quantity: '2' },
    { commodity: 'SEK', quantity: '150' },
  ]);
  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Assets:'],
    groupBy: 'commodity',
    inValuationCommodity: true,
  }), [
    { commodity: 'SEK', quantity: '170' },
  ]);
});

test('values every commodity in the journal default using prices at the upper date', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, { to: '2024-01-01', inValuationCommodity: true }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '100.000000000000000001' },
    { account: 'Assets:Fund', commodity: 'SEK', quantity: '20' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-120.000000000000000001' },
  ]);
  assert.deepEqual(aggregate(databasePath, { to: '2024-01-02', inValuationCommodity: true }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '150' },
    { account: 'Assets:Fund', commodity: 'SEK', quantity: '20' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-170' },
  ]);
});

test('uses materialized valuation rates without loading raw price history', (t) => {
  const databasePath = buildFixture(t);
  const valuationPriceCache = new Map();

  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Assets:Fund'],
    inValuationCommodity: true,
  }, { valuationPriceCache }), [
    { account: 'Assets:Fund', commodity: 'SEK', quantity: '20' },
  ]);

  assert.equal(valuationPriceCache.size, 0);
});

test('uses the latest available price when no upper date is supplied', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, { accounts: ['Assets:Fund'], inValuationCommodity: true }), [
    { account: 'Assets:Fund', commodity: 'SEK', quantity: '20' },
  ]);
});

test('applies inversion and totals as public report options', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Assets:Fund'],
    inValuationCommodity: true,
    invert: true,
    includeTotal: true,
  }), [
    { account: 'Assets:Fund', commodity: 'SEK', quantity: '-20' },
    {
      account: 'Total',
      commodity: 'SEK',
      isTotal: true,
      quantity: '-20',
    },
  ]);
  assert.throws(
    () => aggregate(databasePath, { includeTotal: true }),
    /includeTotal requires inValuationCommodity/u,
  );
});

test('uses the journal default commodity instead of assuming SEK', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-usd-valuation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
P 2024-01-01 FUND 12 USD
2024-01-01 Opening
  Assets:Fund  2 FUND {12 USD}
  Equity:Opening  -24 USD
`);

  const build = buildDatabase(databasePath, journalPath);
  assert.equal(build.valuationCommodity, 'USD');
  assert.deepEqual(aggregate(databasePath, {
    accounts: ['Assets:'],
    inValuationCommodity: true,
  }), [
    { account: 'Assets:Fund', commodity: 'USD', quantity: '24' },
  ]);
});

test('preserves commodity totals while adding exact valuation values for code consumers', (t) => {
  const databasePath = buildFixture(t);

  assert.deepEqual(aggregate(databasePath, {
    to: '2024-01-02',
    accounts: ['Assets:'],
    withValuationValue: true,
  }), [
    {
      account: 'Assets:Cash',
      commodity: 'SEK',
      quantity: '150',
      valuationValue: '150',
    },
    {
      account: 'Assets:Fund',
      commodity: 'FUND',
      quantity: '2',
      valuationValue: '20',
    },
  ]);
  assert.throws(
    () => aggregate(databasePath, { inValuationCommodity: true, withValuationValue: true }),
    /cannot be used together/u,
  );
});

test('rejects invalid intervals and missing valuation price chains', (t) => {
  const databasePath = buildFixture(t);
  assert.throws(() => aggregate(databasePath, { from: '2024-02-30' }), /Invalid --from date/);
  assert.throws(
    () => aggregate(databasePath, { from: '2024-02-01', to: '2024-01-01' }),
    /--from date .* is after --to date/,
  );
  assert.throws(
    () => aggregate(databasePath, { dateBasis: 'actual' }),
    /Invalid dateBasis/u,
  );
  assert.throws(
    () => aggregate(databasePath, { invert: 'true' }),
    /invert must be a boolean/u,
  );
  assert.throws(
    () => aggregate(databasePath, { groupBy: 'currency' }),
    /Invalid groupBy/u,
  );
  assert.throws(
    () => aggregate(databasePath, {
      groupBy: 'commodity', inValuationCommodity: true, includeTotal: true,
    }),
    /includeTotal cannot be used when grouping by commodity/u,
  );
  assert.throws(
    () => aggregate(databasePath, { account: 'Assets:' }),
    /Unknown aggregate option: account/u,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-unpriced-'));
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
    () => aggregate(unpricedDatabasePath, { to: '2024-01-01', inValuationCommodity: true }),
    /No price for OTHER/,
  );
});

test('rejects circular valuation price chains', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-circular-prices-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
P 2024-01-01 FUND 2 NOK
P 2024-01-01 NOK 0.5 FUND
2024-01-01 Opening
  Assets:Fund  1 FUND {1 SEK}
  Equity:Opening  -1 SEK
`);
  buildDatabase(databasePath, journalPath);

  assert.throws(
    () => aggregate(databasePath, { to: '2024-01-01', inValuationCommodity: true }),
    /Circular price chain while converting FUND to SEK/u,
  );
});

test('uses posting dates by default and can use transaction dates', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-posting-date-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `2024-01-01 Delayed posting
  Assets:Cash  10 SEK ; [2024-01-03]
  Equity:Opening  -10 SEK
`);
  buildDatabase(databasePath, journalPath);

  assert.deepEqual(aggregate(databasePath, { to: '2024-01-02' }), [
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-10' },
  ]);
  assert.deepEqual(aggregate(databasePath, { from: '2024-01-03' }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '10' },
  ]);
  assert.deepEqual(aggregate(databasePath, {
    dateBasis: 'transaction',
    to: '2024-01-02',
  }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '10' },
    { account: 'Equity:Opening', commodity: 'SEK', quantity: '-10' },
  ]);
  assert.deepEqual(aggregate(databasePath, {
    dateBasis: 'transaction',
    from: '2024-01-03',
  }), []);
});
