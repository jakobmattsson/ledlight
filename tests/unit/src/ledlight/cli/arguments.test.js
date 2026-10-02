'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArguments, usage } = resolveRepositoryModule("src/ledlight/cli/arguments.js");

test('parses aggregate report options and output flags', () => {
  assert.deepEqual(parseArguments([
    'aggregate',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--accounts', 'Liabilities:',
    '--sek',
    '--invert',
    '--csv',
  ]), {
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:', 'Liabilities:'],
      dateBasis: 'posting',
      inSek: true,
    },
    csv: true,
    invert: true,
  });
});

test('uses aggregate defaults when no options are supplied', () => {
  assert.deepEqual(parseArguments(['aggregate']), {
    reportOptions: { accounts: [], dateBasis: 'posting', inSek: false },
    csv: false,
    invert: false,
  });
});

test('parses balance history options', () => {
  assert.deepEqual(parseArguments([
    'balance-history',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--invert',
    '--csv',
  ]), {
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
      inSek: false,
    },
    csv: true,
    invert: true,
  });
  assert.throws(() => parseArguments(['balance-history', '--sek']), /Usage:/u);
});

test('parses investment performance selections and JSON output', () => {
  assert.deepEqual(parseArguments([
    'investment-performance',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--commodities', 'FUND_A',
    '--commodities', 'FUND_B',
    '--exclude-commodities', 'SEK',
    '--json',
  ]), {
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      commodities: ['FUND_A', 'FUND_B'],
      excludeCommodities: ['SEK'],
    },
    json: true,
  });
  assert.deepEqual(parseArguments(['investment-performance']), {
    reportOptions: { accounts: [], commodities: [], excludeCommodities: [] },
    json: false,
  });
});

test('rejects missing commands, values, duplicate dates, and unknown options', () => {
  const invalidArguments = [
    [],
    ['balance'],
    ['aggregate', '--from'],
    ['aggregate', '--from', '--sek'],
    ['aggregate', '--to', '2024-01-01', '--to', '2024-02-01'],
    ['aggregate', '--date-basis', 'other'],
    ['aggregate', '--date-basis', 'posting', '--date-basis', 'transaction'],
    ['aggregate', '--unknown'],
    ['investment-performance', '--commodities'],
    ['investment-performance', '--from', '2024-01-01', '--from', '2024-02-01'],
    ['investment-performance', '--csv'],
  ];
  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseArguments(arguments_), /Usage:|may only be specified once/u);
  }
  assert.match(usage(), /^Usage:\n {2}ledlight aggregate/u);
  assert.match(usage(), /\n {2}ledlight balance-history/u);
  assert.match(usage(), /\n {2}ledlight investment-performance/u);
});
