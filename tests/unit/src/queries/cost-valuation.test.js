'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery, resolveRepositoryModule } = require('../../../support/repository-container');
const { buildDatabase } = resolveRepositoryModule('src/ingestion/database/database.js').$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');

function fixture(t, journal) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cost-valuation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, journal ?? `commodity SEK
  default
commodity FUND
commodity GIFT
P 2024-01-01 FUND 100 SEK
P 2024-01-02 FUND 150 SEK
P 2024-01-08 FUND 10 SEK

2024-01-01 Buy first lot
  Assets:Broker  10 FUND {100 SEK}
  Assets:Cash  -1000 SEK

2024-01-03 Buy second lot
  Assets:Broker  2 FUND {{240 SEK}}
  Assets:Cash  -240 SEK

2024-01-04 Sell part of first lot
  Assets:Broker  -4 FUND {{400 SEK}} @@ 600 SEK ; [2024-01-05]
  Assets:Cash  600 SEK
  Income:Gains  -200 SEK

2024-01-06 Transfer remaining first-lot units
  Assets:Broker  -2 FUND {{200 SEK}}
  Assets:Other  2 FUND {{200 SEK}}

2024-01-07 Close broker position
  Assets:Broker  -6 FUND {{640 SEK}} @ 140 SEK
  Assets:Cash  840 SEK
  Income:Gains  -200 SEK

2024-01-08 Receive zero-cost units
  Assets:Other  2 GIFT {0 SEK} @ 0 SEK
  Assets:Cash  0 SEK
`);
  buildDatabase(databasePath, journalPath);
  return (name, options) => readDatabase(databasePath, (database) =>
    resolveQuery(name).execute(database, options, { valuationPriceCache: new Map() }));
}

test('cost valuation removes acquisition cost on sales and carries it through transfers', (t) => {
  const query = fixture(t);
  assert.deepEqual(query('aggregate', {
    valuation: 'cost', inValuationCommodity: true, accounts: ['Assets:Broker'], to: '2024-01-05',
  }), [{ account: 'Assets:Broker', commodity: 'SEK', quantity: '840' }]);
  assert.deepEqual(query('aggregate', {
    valuation: 'cost', inValuationCommodity: true, accounts: ['Assets:'], includeTotal: true,
  }), [
    { account: 'Assets:Cash', commodity: 'SEK', quantity: '200' },
    { account: 'Assets:Other', commodity: 'SEK', quantity: '200' },
    { account: 'Total', commodity: 'SEK', quantity: '400', isTotal: true },
  ]);
  assert.deepEqual(query('aggregate', {
    valuation: 'cost', inValuationCommodity: true, accounts: ['Income:'], invert: true,
  }), [{ account: 'Income:Gains', commodity: 'SEK', quantity: '400' }]);
  assert.deepEqual(query('aggregate', {
    valuation: 'cost', inValuationCommodity: true, accounts: ['Assets:Broker'],
    from: '2024-01-04', to: '2024-01-04', dateBasis: 'transaction',
  }), [{ account: 'Assets:Broker', commodity: 'SEK', quantity: '-400' }]);
});

test('cost valuation supports commodity grouping, additional values, totals, and inversion', (t) => {
  const query = fixture(t);
  const selection = { valuation: 'cost', accounts: ['Assets:Broker'], to: '2024-01-05' };
  assert.deepEqual(query('aggregate', { ...selection, groupBy: 'commodity', inValuationCommodity: true }), [
    { commodity: 'SEK', quantity: '840' },
  ]);
  assert.deepEqual(query('aggregate', { ...selection, groupBy: 'commodity', withValuationValue: true }), [
    { commodity: 'FUND', quantity: '8', valuationValue: '840' },
  ]);
  assert.deepEqual(query('aggregate', {
    ...selection, withValuationValue: true, invert: true, includeTotal: true,
  }), [
    { account: 'Assets:Broker', commodity: 'FUND', quantity: '-8', valuationValue: '-840' },
    { account: 'Total', commodity: 'FUND', quantity: '-8', valuationValue: '-840', isTotal: true },
  ]);
  assert.deepEqual(query('aggregate', selection), [
    { account: 'Assets:Broker', commodity: 'FUND', quantity: '8' },
  ]);
});

test('cost history includes opening costs and ignores market movements across daily balances', (t) => {
  const query = fixture(t);
  const selection = { valuation: 'cost', accounts: ['Assets:Broker', 'Assets:Other'] };
  assert.deepEqual(query('balanceHistoryReport', { ...selection, from: '2024-01-02' }), [
    { date: '2024-01-02', amount: '1000', commodity: 'SEK' },
    { date: '2024-01-03', amount: '1240', commodity: 'SEK' },
    { date: '2024-01-04', amount: '1240', commodity: 'SEK' },
    { date: '2024-01-05', amount: '840', commodity: 'SEK' },
    { date: '2024-01-06', amount: '840', commodity: 'SEK' },
    { date: '2024-01-07', amount: '200', commodity: 'SEK' },
    { date: '2024-01-08', amount: '200', commodity: 'SEK' },
  ]);
  assert.deepEqual(query('balanceHistoryReport', {
    ...selection, from: '2024-01-04', to: '2024-01-04', dateBasis: 'transaction', invert: true,
  }), [{ date: '2024-01-04', amount: '-840', commodity: 'SEK' }]);
  assert.deepEqual(query('balanceHistoryReport', { ...selection, accounts: ['Missing'] }), []);
});

test('market remains the API default and valuation rejects unsupported values', (t) => {
  const query = fixture(t);
  for (const name of ['aggregate', 'balanceHistoryReport']) {
    const options = { accounts: ['Assets:Broker'], to: '2024-01-05' };
    if (name === 'aggregate') options.inValuationCommodity = true;
    assert.deepEqual(query(name, options), query(name, { ...options, valuation: 'market' }));
    assert.equal(resolveQuery(name).inputSchema.parse({}).valuation, 'market');
    for (const valuation of ['book', '', null, true]) {
      assert.throws(() => query(name, { valuation }), { code: 'LEDLIGHT_INVALID_API_INPUT' });
    }
  }
  assert.deepEqual(query('aggregate', {
    accounts: ['Assets:Broker'], to: '2024-01-05', inValuationCommodity: true,
  }), [{ account: 'Assets:Broker', commodity: 'SEK', quantity: '1200' }]);
});

test('cost mode requires no prices and preserves exact decimal costs and cash', (t) => {
  const query = fixture(t, `commodity SEK
  default
commodity FUND
2024-01-01 Opening
  Assets:Fund  3 FUND {0.100000000000000001 SEK}
  Assets:Cash  0.2 SEK
  Equity:Opening
`);
  assert.deepEqual(query('aggregate', {
    valuation: 'cost', accounts: ['Assets:'], inValuationCommodity: true, groupBy: 'commodity',
  }), [{ commodity: 'SEK', quantity: '0.500000000000000003' }]);
  assert.deepEqual(query('balanceHistoryReport', { valuation: 'cost', accounts: ['Assets:'] }), [
    { date: '2024-01-01', amount: '0.500000000000000003', commodity: 'SEK' },
  ]);
});

test('missing or foreign lot costs fail without falling back to market prices', (t) => {
  for (const cost of ['', '{2 EUR}']) {
    const query = fixture(t, `commodity SEK
  default
commodity FUND
commodity EUR
P 2024-01-01 FUND 10 SEK
P 2024-01-01 EUR 12 SEK
2024-01-01 Opening cash
  Assets:Cash  5 SEK
  Equity:Opening
2024-01-02 Missing acquisition cost
  Assets:Fund  1 FUND ${cost}
  Equity:Opening
`);
    for (const name of ['aggregate', 'balanceHistoryReport']) {
      const options = { valuation: 'cost', accounts: ['Assets:'] };
      if (name === 'aggregate') options.inValuationCommodity = true;
      assert.throws(() => query(name, options), {
        code: 'LEDLIGHT_MISSING_VALUATION_DATA',
        message: /a lot cost in SEK is required/u,
      });
      assert.doesNotThrow(() => query(name, { ...options, to: '2024-01-01' }));
      assert.doesNotThrow(() => query(name, { ...options, accounts: ['Assets:Cash'] }));
    }
    assert.throws(() => query('aggregate', {
      valuation: 'cost', withValuationValue: true, accounts: ['Assets:Fund'],
    }), { code: 'LEDLIGHT_MISSING_VALUATION_DATA' });
  }
});
