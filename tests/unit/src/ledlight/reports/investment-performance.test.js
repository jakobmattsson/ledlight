'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { queryInvestmentPerformance } = resolveRepositoryModule("src/ledlight/reports/investment-performance.js");
const { xirr } = resolveRepositoryModule("src/ledlight/reports/investment-returns.js").$$private;
const { buildDatabase } = resolveRepositoryModule("src/ledlight/sqlite/database.js").$$private;

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
  Assets:Portfolio  10 FUND
  Assets:Unrelated cash  500 SEK
  Equity:Opening  -500 SEK

2024-01-01 Buy home
  Assets:Home  -1000 SEK
  Assets:Home  1 HOME

2024-01-02 Buy more fund
  Assets:Portfolio  -55 SEK
  Assets:Portfolio  5 FUND

2024-01-03 Sell fund
  Assets:Portfolio  60 SEK
  Assets:Portfolio  -5 FUND
`);
  buildDatabase(databasePath, journalPath);
  return databasePath;
}

test('calculates cash profit, time-weighted return and money-weighted return for selected instruments', (t) => {
  const result = queryInvestmentPerformance(buildFixture(t), {
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
  const result = queryInvestmentPerformance(buildFixture(t), {
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
  Assets:Portfolio  10 FUND @@ 100 SEK ; [2024-02-01]
  Equity:Opening  -100 SEK
`);
  buildDatabase(databasePath, journalPath);

  const result = queryInvestmentPerformance(databasePath, {
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
