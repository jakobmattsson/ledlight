'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const valuationRates = resolveRepositoryModule("src/queries/support/valuation-rates.js");
const { createLedgerValuationRateResolver } = valuationRates;
const {
  resolveValuationRates,
  selectLatestPrices,
  selectMaterializedValuationRates,
} = valuationRates.$$private;

test('selects the latest price through a date using journal order as a tiebreaker', (t) => {
  const database = new Database(':memory:');
  t.after(() => database.close());
  database.exec(`
    CREATE TABLE journal_entries (id INTEGER PRIMARY KEY, sequence INTEGER NOT NULL);
    CREATE TABLE prices (
      entry_id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      base_commodity TEXT NOT NULL,
      quote_quantity TEXT NOT NULL,
      quote_commodity TEXT NOT NULL
    );
    INSERT INTO journal_entries (id, sequence) VALUES (1, 1), (2, 2), (3, 3);
    INSERT INTO prices
      (entry_id, date, base_commodity, quote_quantity, quote_commodity)
    VALUES
      (1, '2024-01-02', 'FUND', '12', 'NOK'),
      (2, '2024-01-02', 'FUND', '13', 'NOK'),
      (3, '2024-01-03', 'FUND', '14', 'NOK');
  `);

  assert.deepEqual(selectLatestPrices(database, '2024-01-02').get('FUND'), {
    base_commodity: 'FUND',
    quote_quantity: '13',
    quote_commodity: 'NOK',
  });
  assert.equal(selectLatestPrices(database).get('FUND').quote_quantity, '14');
});

test('resolves exact chained rates and always treats the valuation commodity as one', () => {
  const prices = new Map([
    ['FUND', { quote_quantity: '12', quote_commodity: 'NOK' }],
    ['NOK', { quote_quantity: '1.1', quote_commodity: 'SEK' }],
  ]);

  assert.deepEqual(
    [...resolveValuationRates(prices, new Set(['FUND', 'SEK']), 'SEK').entries()],
    [['SEK', '1'], ['NOK', '1.1'], ['FUND', '13.2']],
  );
});

test('prefers an older direct quote and falls back from an unusable newer quote', () => {
  const resolve = createLedgerValuationRateResolver([
    { date: '2024-01-01', base_commodity: 'FUND', quote_quantity: '10', quote_commodity: 'SEK' },
    { date: '2024-02-01', base_commodity: 'FUND', quote_quantity: '2', quote_commodity: 'NOK' },
  ], 'SEK');

  assert.equal(resolve('FUND', '2024-02-01'), '10');
});

test('selects materialized rates from one common latest date', (t) => {
  const database = new Database(':memory:');
  t.after(() => database.close());
  database.exec(`
    CREATE TABLE valuation_prices (
      commodity TEXT NOT NULL,
      date TEXT NOT NULL,
      rate TEXT NOT NULL,
      PRIMARY KEY (commodity, date)
    ) WITHOUT ROWID;
    INSERT INTO valuation_prices (commodity, date, rate) VALUES
      ('FUND', '2024-01-01', '10'),
      ('FUND', '2024-01-02', '11'),
      ('NOK', '2024-01-01', '1.1');
  `);

  assert.deepEqual(
    [...selectMaterializedValuationRates(
      database,
      '2024-01-03',
      new Set(['FUND', 'NOK', 'SEK']),
      'SEK',
    )],
    [['SEK', '1'], ['FUND', '11']],
  );
});

test('reports missing and circular price chains with date context', () => {
  assert.throws(
    () => resolveValuationRates(new Map(), new Set(['FUND']), 'SEK', '2024-01-31'),
    /No price for FUND on or before 2024-01-31 can convert it to SEK/u,
  );

  const circularPrices = new Map([
    ['FUND', { quote_quantity: '2', quote_commodity: 'NOK' }],
    ['NOK', { quote_quantity: '0.5', quote_commodity: 'FUND' }],
  ]);
  assert.throws(
    () => resolveValuationRates(circularPrices, new Set(['FUND']), 'SEK'),
    /Circular price chain while converting FUND to SEK/u,
  );
});
