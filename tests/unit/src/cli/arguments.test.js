'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createArguments = require('../../../../src/cli/arguments');
const argumentsModule = resolveRepositoryModule('src/cli/arguments.js');
const { apiCommands, parseArguments, usage } = argumentsModule;
const journal = resolveRepositoryModule('src/ingestion/journal/load.js');
const ledgerParser = resolveRepositoryModule('src/ingestion/syntax/parser.js');
const project = resolveRepositoryModule('src/application/project.js');

test('defines one CLI command for every public API operation', () => {
  assert.deepEqual(apiCommands, {
    parse: 'parse',
    loadJournal: 'load-journal',
    loadProjectPaths: 'project-paths',
    ensureProjectDatabaseCurrent: 'ensure-database',
    openProject: 'open-project',
    accountBalances: 'account-balances',
    accountPostings: 'account-postings',
    aggregateReport: 'aggregate',
    balanceHistoryReport: 'balance-history',
    gainReport: 'gain',
    investmentPerformance: 'investment-performance',
    accountTransactions: 'account-transactions',
    commodityDescriptions: 'commodity-descriptions',
    ledgerAccounts: 'ledger-accounts',
    ledgerTransaction: 'ledger-transaction',
    ledgerTransactions: 'ledger-transactions',
    ledgerValuationRateResolver: 'valuation-rate',
  });
});

test('fails when a locally declared API input has no actual CLI option', () => {
  const apiDefinitions = {
    ...project.apiDefinitions,
    aggregateReport: {
      inputs: [...project.apiDefinitions.aggregateReport.inputs, 'futureOption'],
    },
  };
  assert.throws(
    () => createArguments({
      journal,
      ledgerParser,
      project: { apiDefinitions },
    }),
    /CLI inputs do not cover the aggregateReport API contract/u,
  );
});

test('parses aggregate report options and output flags', () => {
  assert.deepEqual(parseArguments([
    'aggregate',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--accounts', 'Liabilities:',
    '--value',
    '--invert',
    '--csv',
  ]), {
    command: 'aggregate',
    startDirectory: undefined,
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:', 'Liabilities:'],
      inValuationCommodity: true,
      invert: true,
    },
    output: { csv: true, json: false },
  });
});

test('uses aggregate defaults when no options are supplied', () => {
  assert.deepEqual(parseArguments(['aggregate']), {
    command: 'aggregate',
    startDirectory: undefined,
    reportOptions: { accounts: [] },
    output: { csv: false, json: false },
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
    command: 'balance-history',
    startDirectory: undefined,
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
      invert: true,
    },
    output: { csv: true, json: false },
  });
  assert.throws(() => parseArguments(['balance-history', '--value']), /Usage:/u);
});

test('parses gain report options and output flags', () => {
  assert.deepEqual(parseArguments([
    'gain',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--csv',
  ]), {
    command: 'gain',
    startDirectory: undefined,
    reportOptions: {
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
    },
    output: { csv: true, json: false },
  });
  assert.deepEqual(parseArguments(['gain']), {
    command: 'gain',
    startDirectory: undefined,
    reportOptions: { accounts: [] },
    output: { csv: false, json: false },
  });
  assert.throws(() => parseArguments(['gain', '--from', '2024-01-01']), /Usage:/u);
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
    command: 'investment-performance',
    startDirectory: undefined,
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      commodities: ['FUND_A', 'FUND_B'],
      excludeCommodities: ['SEK'],
    },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['investment-performance']), {
    command: 'investment-performance',
    startDirectory: undefined,
    reportOptions: { accounts: [], commodities: [], excludeCommodities: [] },
    output: { csv: false, json: false },
  });
});

test('maps every remaining API parameter to CLI arguments', () => {
  assert.deepEqual(parseArguments([
    'aggregate', '--directory', '/project', '--with-valuation-value', '--json',
  ]), {
    command: 'aggregate',
    startDirectory: '/project',
    reportOptions: { accounts: [], withValuationValue: true },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['aggregate', '--value', '--include-total']), {
    command: 'aggregate',
    startDirectory: undefined,
    reportOptions: { accounts: [], inValuationCommodity: true, includeTotal: true },
    output: { csv: false, json: false },
  });
  assert.deepEqual(parseArguments([
    'balance-history', '--account-factor', 'Assets:Fund=0.7',
    '--account-factor', 'Assets:Cash=1', '--json',
  ]), {
    command: 'balance-history',
    startDirectory: undefined,
    reportOptions: {
      accounts: [],
      accountFactors: { 'Assets:Fund': '0.7', 'Assets:Cash': '1' },
    },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['parse', 'account Assets:Cash\n', '--source', 'input.ledger']), {
    command: 'parse',
    startDirectory: undefined,
    arguments: ['account Assets:Cash\n', { source: 'input.ledger' }],
  });
  assert.deepEqual(parseArguments(['load-journal', '/project/journal.ledger']), {
    command: 'load-journal',
    startDirectory: undefined,
    arguments: ['/project/journal.ledger'],
  });
  assert.deepEqual(parseArguments(['account-balances', '--account', 'Assets:Cash', '--to', '2024-12-31']), {
    command: 'account-balances', startDirectory: undefined,
    options: { account: 'Assets:Cash', to: '2024-12-31' },
  });
  assert.deepEqual(parseArguments(['account-postings', '--account', 'Assets:Cash', '--after', '2024-01-01']), {
    command: 'account-postings', startDirectory: undefined,
    options: { account: 'Assets:Cash', after: '2024-01-01' },
  });
  assert.deepEqual(parseArguments(['account-transactions', '--account', 'Assets:Cash']), {
    command: 'account-transactions', startDirectory: undefined,
    options: { account: 'Assets:Cash' },
  });
  assert.deepEqual(parseArguments([
    'ledger-transactions', '--order', 'oldest', '--page', '2', '--page-size', '25',
  ]), {
    command: 'ledger-transactions', startDirectory: undefined,
    options: { order: 'oldest', page: '2', pageSize: '25' },
  });
  assert.deepEqual(parseArguments(['ledger-transaction', '--transaction-id', '42']), {
    command: 'ledger-transaction', startDirectory: undefined, options: { transactionId: '42' },
  });
  assert.deepEqual(parseArguments([
    'valuation-rate', '--commodity', 'EUR', '--through-date', '2024-12-31',
  ]), {
    command: 'valuation-rate', startDirectory: undefined,
    options: { commodity: 'EUR', throughDate: '2024-12-31' },
  });
});

test('rejects missing commands, values, duplicate dates, and unknown options', () => {
  const invalidArguments = [
    [],
    ['balance'],
    ['aggregate', '--from'],
    ['aggregate', '--from', '--value'],
    ['aggregate', '--to', '2024-01-01', '--to', '2024-02-01'],
    ['aggregate', '--date-basis', 'other'],
    ['aggregate', '--date-basis', 'posting', '--date-basis', 'transaction'],
    ['aggregate', '--unknown'],
    ['investment-performance', '--commodities'],
    ['investment-performance', '--from', '2024-01-01', '--from', '2024-02-01'],
    ['investment-performance', '--csv'],
    ['gain', '--value'],
  ];
  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseArguments(arguments_), /Usage:|may only be specified once/u);
  }
  assert.match(usage(), /^Usage: ledlight/u);
  assert.match(usage(), /Usage: ledlight aggregate/u);
  assert.match(usage(), /Usage: ledlight balance-history/u);
  assert.match(usage(), /Usage: ledlight gain/u);
  assert.match(usage(), /Usage: ledlight investment-performance/u);
  assert.match(usage(), /--accounts <prefix>.*repeatable/u);
});
