'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatCsv,
  formatBalanceHistoryCsv,
  formatBalanceHistoryHumanReadable,
  formatHumanReadable,
  formatInvestmentPerformance,
  formatInvestmentPerformanceJson,
} = resolveRepositoryModule("src/ledlight/cli/format.js");

const rows = [
  { account: 'Assets:Cash,Main', quantity: '2.005', commodity: 'SEK' },
  { account: 'Assets:LongAccount', quantity: '10000', commodity: 'SEK' },
];
const rowsWithTotal = [
  ...rows,
  {
    account: 'Total',
    quantity: '10002.005',
    commodity: 'SEK',
    isTotal: true,
  },
];

test('formats RFC-style CSV and exact valuation rounding', () => {
  assert.equal(
    formatCsv([
      { account: 'Assets:"Cash",Main', quantity: '1.005', commodity: 'SEK' },
    ], true),
    'account,amount,commodity\n"Assets:""Cash"",Main",1.01,SEK\n',
  );
  assert.equal(formatCsv([], false), 'account,amount,commodity\n');
});

test('aligns human-readable output and uses an English total label', () => {
  assert.equal(
    formatHumanReadable(rowsWithTotal, true),
    '  Assets:Cash,Main       2.01 SEK\n' +
    'Assets:LongAccount  10,000.00 SEK\n' +
    '             --------------------\n' +
    '             Total  10,002.01 SEK\n',
  );
  assert.equal(formatHumanReadable([], true), '');
});

test('formats balance history', () => {
  const balanceRows = [
    { date: '2024-01-01', amount: '2.005', commodity: 'USD' },
    { date: '2024-01-02', amount: '10000', commodity: 'USD' },
  ];
  assert.equal(
    formatBalanceHistoryCsv(balanceRows),
    'date,amount\n2024-01-01,2.01\n2024-01-02,10000.00\n',
  );
  assert.equal(
    formatBalanceHistoryHumanReadable(balanceRows),
    '2024-01-01       2.01 USD\n2024-01-02  10,000.00 USD\n',
  );
  assert.deepEqual(balanceRows.map((row) => row.amount), ['2.005', '10000']);
});

test('formats investment performance for people and automation', () => {
  const report = {
    from: '2024-01-01',
    to: '2024-12-31',
    commodities: ['FUND'],
    valuationCommodity: 'USD',
    openingValue: 1000,
    netContributions: 250.5,
    endingValue: 1400,
    profitLoss: 149.5,
    timeWeightedReturn: 0.12345,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: 0.2,
    points: [],
  };
  assert.equal(formatInvestmentPerformance(report),
    'Investment performance from 2024-01-01 to 2024-12-31\n' +
    'Instruments: 1\n' +
    'Opening value: 1,000.00 USD\n' +
    'Net contributions: 250.50 USD\n' +
    'Ending value: 1,400.00 USD\n' +
    'Profit/loss: 149.50 USD\n' +
    'Time-weighted return: 12.35 %\n' +
    'Money-weighted return (total): 20.00 %\n' +
    'Money-weighted return (annualized): n/a\n');
  assert.equal(formatInvestmentPerformanceJson(report), `${JSON.stringify(report, null, 2)}\n`);
});
