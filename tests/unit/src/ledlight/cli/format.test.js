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

test('applies declared commodity precision and separators only to human-readable output', () => {
  const descriptions = [
    { commodity: 'BTC', format: '1000.00000000 BTC' },
    { commodity: 'EUR', format: '1,000.00 EUR' },
    { commodity: 'JPY', format: '1,000 JPY' },
  ];
  assert.equal(
    formatHumanReadable([
      { account: 'Assets:Bitcoin', quantity: '1234.5', commodity: 'BTC' },
      { account: 'Assets:Euros', quantity: '1234.5', commodity: 'EUR' },
      { account: 'Assets:Yen', quantity: '1234.5', commodity: 'JPY' },
    ], false, descriptions),
    'Assets:Bitcoin   1234.50000000 BTC\n' +
    '  Assets:Euros  1,234.50       EUR\n' +
    '    Assets:Yen  1,235          JPY\n',
  );
  assert.equal(
    formatCsv([{ account: 'Assets:Euros', quantity: '1234.5', commodity: 'EUR' }], false),
    'account,amount,commodity\nAssets:Euros,1234.5,EUR\n',
  );
});

test('formats double-quoted commodity symbols', () => {
  assert.equal(
    formatHumanReadable([
      { account: 'Assets:Fund', quantity: '1234.5', commodity: '"Fund A"' },
    ], false, [{ commodity: '"Fund A"', format: '1,000.00 "Fund A"' }]),
    'Assets:Fund  1,234.50 "Fund A"\n',
  );
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

test('uses the valuation commodity format for human-readable valuation reports', () => {
  const descriptions = [{ commodity: 'EUR', format: '1,000.000 EUR' }];
  assert.equal(
    formatBalanceHistoryHumanReadable([
      { date: '2024-01-01', amount: '1234.5678', commodity: 'EUR' },
    ], descriptions),
    '2024-01-01  1,234.568 EUR\n',
  );
  const report = {
    from: '2024-01-01',
    to: '2024-01-01',
    commodities: [],
    valuationCommodity: 'EUR',
    openingValue: 1234.5678,
    netContributions: 0,
    endingValue: 1234.5678,
    profitLoss: 0,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
  };
  assert.match(formatInvestmentPerformance(report, descriptions), /Opening value: 1,234\.568 EUR/u);
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
