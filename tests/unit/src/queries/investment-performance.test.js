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
const { execute: queryInvestmentPerformance } = resolveQuery('investmentPerformance');
const { xirr } = resolveRepositoryModule("src/queries/support/investment-returns.js").$$private;
const { buildDatabase } = resolveRepositoryModule("src/ingestion/database/database.js").$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');

function investmentPerformance(databasePath, options) {
  return readDatabase(databasePath,
    (database) => queryInvestmentPerformance(database, options, { valuationPriceCache: new Map() }));
}

function buildFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-investment-performance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
commodity HOME
P 2024-01-01 FUND 10 SEK
P 2024-01-02 FUND 11 SEK
P 2024-01-03 FUND 12 SEK
P 2024-01-01 HOME 1000 SEK

2024-01-01 Buy fund
  Assets:Portfolio  -100 SEK
  Assets:Portfolio  10 FUND {10 SEK}
  Assets:Unrelated cash  500 SEK
  Equity:Opening  -500 SEK

2024-01-01 Buy home
  Assets:Home  -1000 SEK
  Assets:Home  1 HOME {1000 SEK}

2024-01-02 Buy more fund
  Assets:Portfolio  -55 SEK
  Assets:Portfolio  5 FUND {11 SEK}

2024-01-03 Sell fund
  Assets:Portfolio  60 SEK
  Assets:Portfolio  -5 FUND {11 SEK} @ 12 SEK
  Income:Capital Gains  -5 SEK
`);
  buildDatabase(databasePath, journalPath);
  return databasePath;
}

test('calculates cash profit, time-weighted return and money-weighted return for selected instruments', (t) => {
  const result = investmentPerformance(buildFixture(t), {
    accounts: ['Assets:'],
    commodities: ['FUND'],
  });

  assert.equal(result.openingValue, 0);
  assert.equal(result.endingValue, 120);
  assert.equal(result.netContributions, 95);
  assert.equal(result.profitLoss, 25);
  assert.ok(Math.abs(result.timeWeightedReturn - 0.2) < 1e-12);
  assert.ok(Number.isFinite(result.moneyWeightedReturn));
  assert.ok(Number.isFinite(result.moneyWeightedReturnTotal));
  assert.deepEqual(result.points.map(({ date, value, netContributions, profitLoss }) => ({
    date,
    value,
    netContributions,
    profitLoss,
  })), [
    { date: '2024-01-01', value: 100, netContributions: 100, profitLoss: 0 },
    { date: '2024-01-02', value: 165, netContributions: 155, profitLoss: 10 },
    { date: '2024-01-03', value: 120, netContributions: 95, profitLoss: 25 },
  ]);
  assert.ok(Math.abs(result.points.at(-1).timeWeightedReturn - 0.2) < 1e-12);
  assert.equal(result.points.at(-1).moneyWeightedReturnTotal, result.moneyWeightedReturnTotal);
});

test('discovers owned commodities and applies exclusions', (t) => {
  const result = investmentPerformance(buildFixture(t), {
    accounts: ['Assets:'],
    excludeCommodities: ['SEK', 'HOME'],
  });

  assert.deepEqual(result.commodities, ['FUND']);
  assert.equal(result.profitLoss, 25);
});

test('uses posting dates for positions, prices, and external flows', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-investment-posting-date-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
P 2024-02-01 FUND 10 SEK

2024-01-01 Backdated acquisition
  Assets:Portfolio  10 FUND {{100 SEK}} ; [2024-02-01]
  Equity:Opening  -100 SEK
`);
  buildDatabase(databasePath, journalPath);

  const result = investmentPerformance(databasePath, {
    accounts: ['Assets:Portfolio'],
    commodities: ['FUND'],
  });

  assert.equal(result.from, '2024-02-01');
  assert.equal(result.endingValue, 100);
  assert.equal(result.netContributions, 100);
  assert.deepEqual(result.points.map(({ date }) => date), ['2024-02-01']);
});

test('calculates annualized XIRR from dated cash flows', () => {
  const result = xirr([
    { date: '2023-01-01', amount: -100 },
    { date: '2024-01-01', amount: 110 },
  ]);

  assert.ok(Math.abs(result - 0.1) < 1e-10);
});

test('limits valuation requirements to the interval and its opening balance', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-performance-interval-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
commodity OTHER
P 2024-01-02 FUND 10 SEK
P 2024-01-03 FUND 12 SEK

2024-01-01 Acquisition before prices are available
  Assets:Portfolio  10 FUND
  Equity:Opening  -10 FUND

2024-01-04 Future acquisition without conversion prices
  Assets:Portfolio  1 FUND
  Assets:Portfolio  -1 OTHER
`);
  buildDatabase(databasePath, journalPath);

  const options = { accounts: ['Assets:Portfolio'], from: '2024-01-03', to: '2024-01-03' };
  const result = investmentPerformance(databasePath, options);
  assert.deepEqual(result.commodities, ['FUND']);
  assert.equal(result.openingValue, 100);
  assert.equal(result.endingValue, 120);
  assert.equal(result.netContributions, 0);
  assert.equal(result.profitLoss, 20);
  assert.ok(Math.abs(result.timeWeightedReturn - 0.2) < 1e-12);
  assert.deepEqual(result.points.map(({ date }) => date), ['2024-01-03']);
  assert.throws(() => investmentPerformance(databasePath, { ...options, from: '2024-01-02' }),
    /No price for FUND on or before 2024-01-01/u);
  assert.throws(() => investmentPerformance(databasePath, { ...options, to: '2024-01-04' }),
    /No price for OTHER on or before 2024-01-04/u);
});

test('does not require conversion prices for cash flows before from or after to', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-performance-flows-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
commodity OTHER
P 2024-01-01 FUND 10 SEK
P 2024-01-02 FUND 11 SEK
P 2024-01-03 FUND 12 SEK

2024-01-01 Acquisition with unpriced cash flow
  Assets:Portfolio  10 FUND
  Assets:Portfolio  -10 OTHER

2024-01-03 Future acquisition with unpriced cash flow
  Assets:Portfolio  1 FUND
  Assets:Portfolio  -1 OTHER
`);
  buildDatabase(databasePath, journalPath);
  const result = investmentPerformance(databasePath, {
    accounts: ['Assets:Portfolio'], commodities: ['FUND'], from: '2024-01-02', to: '2024-01-02',
  });
  assert.equal(result.openingValue, 100);
  assert.equal(result.endingValue, 110);
  assert.equal(result.profitLoss, 10);
  assert.equal(result.netContributions, 0);
});

test('retains the latest opening balance when from is beyond available history', (t) => {
  const result = investmentPerformance(buildFixture(t), {
    accounts: ['Assets:Portfolio'], commodities: ['FUND'], from: '2024-01-10',
  });
  assert.equal(result.from, '2024-01-10');
  assert.equal(result.to, '2024-01-10');
  assert.equal(result.openingValue, 120);
  assert.equal(result.endingValue, 120);
  assert.equal(result.netContributions, 0);
  assert.deepEqual(result.points, []);
});

function annotatedFixture(t, body) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-performance-invariants-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
commodity FUND
  format 1,000.00 FUND
account Assets:Broker
account Assets:Other
account Assets:Cash
account Assets:Unrelated
account Equity:Opening
account Income:Gains
account Expenses:Fees
${body}`);
  assert.deepEqual(buildDatabase(databasePath, journalPath).warnings, []);
  return databasePath;
}

function tradeFixture(t, cash, extra) {
  return annotatedFixture(t, `2024-01-01 Purchase
  Assets:Broker  1 FUND {100 USD}
  ${cash}  -100 USD
${extra || ''}
P 2024-01-01 FUND 120 USD
2024-01-02 Sale
  Assets:Broker  -0.5 FUND {100 USD} @ 130 USD
  ${cash}  65 USD
  Income:Gains  -15 USD
P 2024-01-02 FUND 140 USD
`);
}

test('keeps contributions and all returns invariant when trade cash moves between selected accounts', (t) => {
  const options = { accounts: ['^Assets:'], commodities: ['FUND'] };
  const together = investmentPerformance(tradeFixture(t, 'Assets:Broker'), options);
  const separate = investmentPerformance(tradeFixture(t, 'Assets:Cash'), options);
  const unrelated = investmentPerformance(tradeFixture(t, 'Assets:Cash',
    '  Assets:Unrelated  500 USD\n  Equity:Opening  -500 USD'), options);
  assert.deepEqual(separate, together);
  assert.deepEqual(unrelated, together);
  assert.equal(together.endingValue, 70);
  assert.equal(together.netContributions, 35);
  assert.equal(together.profitLoss, 35);
  assert.equal(together.points[0].profitLoss, 20);
  assert.ok(Math.abs(together.timeWeightedReturn - 0.35) < 1e-12);
});

test('uses annotated trade values even when settlement accounts are outside the selection', (t) => {
  const databasePath = tradeFixture(t, 'Assets:Cash');
  const instrument = investmentPerformance(databasePath, { accounts: ['^Assets:Broker$'], commodities: ['FUND'] });
  const portfolio = investmentPerformance(databasePath, { accounts: ['^Assets:'], commodities: ['FUND'] });
  assert.deepEqual(instrument, portfolio);
  const period = investmentPerformance(databasePath, {
    accounts: ['^Assets:'], commodities: ['FUND'], from: '2024-01-02', to: '2024-01-02',
  });
  assert.equal(period.openingValue, 120);
  assert.equal(period.netContributions, -65);
  assert.equal(period.profitLoss, 15);
});

test('does not count purchases funded by selected portfolio cash as new contributions', (t) => {
  const databasePath = annotatedFixture(t, `2024-01-01 Deposit
  Assets:Cash  100 USD
  Equity:Opening  -100 USD
2024-01-01 Purchase
  Assets:Broker  1 FUND {{100 USD}}
  Assets:Cash  -100 USD
P 2024-01-01 FUND 120 USD
`);
  const result = investmentPerformance(databasePath, { accounts: ['^Assets:'] });
  assert.equal(result.netContributions, 100);
  assert.equal(result.endingValue, 120);
  assert.equal(result.profitLoss, 20);
  assert.ok(Math.abs(result.timeWeightedReturn - 0.2) < 1e-12);
});

for (const cash of ['Assets:Broker', 'Assets:Cash']) {
  test(`uses total sale prices and excludes separately expensed fees with cash in ${cash}`, (t) => {
    const databasePath = annotatedFixture(t, `2024-01-01 Purchase
  Assets:Broker  2 FUND {{200 USD}}
  ${cash}  -205 USD
  Expenses:Fees  5 USD
P 2024-01-01 FUND 100 USD
2024-01-02 Sale
  Assets:Broker  -1 FUND {{100 USD}} @@ 130 USD
  ${cash}  125 USD
  Expenses:Fees  5 USD
  Income:Gains  -30 USD
P 2024-01-02 FUND 140 USD
`);
    const result = investmentPerformance(databasePath, { accounts: ['^Assets:'], commodities: ['FUND'] });
    assert.equal(result.netContributions, 70);
    assert.equal(result.profitLoss, 70);
  });
}

test('cancels internal transfers and values transfers across the selection at market', (t) => {
  const databasePath = annotatedFixture(t, `2024-01-01 Purchase
  Assets:Broker  1 FUND {100 USD}
  Assets:Cash  -100 USD
P 2024-01-01 FUND 100 USD
2024-01-02 Transfer
  Assets:Broker  -1 FUND {100 USD}
  Assets:Other  1 FUND {100 USD}
P 2024-01-02 FUND 120 USD
`);
  const both = investmentPerformance(databasePath, { accounts: ['^Assets:'], commodities: ['FUND'] });
  assert.equal(both.netContributions, 100);
  assert.equal(both.profitLoss, 20);
  const incoming = investmentPerformance(databasePath, { accounts: ['^Assets:Other$'], commodities: ['FUND'] });
  assert.equal(incoming.netContributions, 120);
  assert.equal(incoming.profitLoss, 0);
  const outgoing = investmentPerformance(databasePath, { accounts: ['^Assets:Broker$'], commodities: ['FUND'] });
  assert.equal(outgoing.netContributions, -20);
  assert.equal(outgoing.profitLoss, 20);
});

test('does not count the extra units in a split as a contribution', (t) => {
  const databasePath = annotatedFixture(t, `2024-01-01 Purchase
  Assets:Broker  1 FUND {100 USD}
  Assets:Cash  -100 USD
P 2024-01-01 FUND 100 USD
2024-01-02 Split
  Assets:Broker  -1 FUND {100 USD}
  Assets:Broker  2 FUND {50 USD}
P 2024-01-02 FUND 60 USD
`);
  const result = investmentPerformance(databasePath, { accounts: ['^Assets:'], commodities: ['FUND'] });
  assert.equal(result.netContributions, 100);
  assert.equal(result.endingValue, 120);
  assert.equal(result.profitLoss, 20);
});
