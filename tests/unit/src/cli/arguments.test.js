'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createArguments = require('../../../../src/cli/cli-arguments');
const project = resolveRepositoryModule('src/core/project.js');
const argumentsModule = createArguments({
  cliConfiguration: { apply: (arguments_) => arguments_ },
  project,
});
const { apiCommands, parseArguments, usage } = argumentsModule;

test('defines one CLI command for every journal operation', () => {
  assert.deepEqual(apiCommands, {
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
    reconciliationEntries: 'reconciliation-entries',
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
      cliConfiguration: { apply: (arguments_) => arguments_ },
      project: { apiDefinitions },
    }),
    /CLI inputs do not cover the aggregateReport API contract/u,
  );
});

test('parses aggregate report options and output flags', () => {
  assert.deepEqual(parseArguments([
    'aggregate',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--accounts', 'Liabilities:',
    '--value',
    '--invert',
    '--csv',
  ]), {
    command: 'aggregate',
    journalPath: '/journal',
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
  assert.deepEqual(parseArguments(['aggregate', '--file', '/journal']), {
    command: 'aggregate',
    journalPath: '/journal',
    reportOptions: { accounts: [] },
    output: { csv: false, json: false },
  });
});

test('uses the CLI configuration file argument when --file is omitted', () => {
  const configuredArguments = createArguments({
    cliConfiguration: {
      apply: (arguments_) => [arguments_[0], '--file', '/configured-journal'],
    },
    project,
  });

  assert.deepEqual(configuredArguments.parseArguments(['aggregate']), {
    command: 'aggregate',
    journalPath: '/configured-journal',
    reportOptions: { accounts: [] },
    output: { csv: false, json: false },
  });
});

test('parses balance history options', () => {
  assert.deepEqual(parseArguments([
    'balance-history',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--invert',
    '--csv',
  ]), {
    command: 'balance-history',
    journalPath: '/journal',
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
    '--file', '/journal',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--csv',
  ]), {
    command: 'gain',
    journalPath: '/journal',
    reportOptions: {
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
    },
    output: { csv: true, json: false },
  });
  assert.deepEqual(parseArguments(['gain', '--file', '/journal']), {
    command: 'gain',
    journalPath: '/journal',
    reportOptions: { accounts: [] },
    output: { csv: false, json: false },
  });
  assert.throws(() => parseArguments(['gain', '--from', '2024-01-01']), /Usage:/u);
});

test('parses investment performance selections and JSON output', () => {
  assert.deepEqual(parseArguments([
    'investment-performance',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--commodities', 'FUND_A',
    '--commodities', 'FUND_B',
    '--exclude-commodities', 'SEK',
    '--json',
  ]), {
    command: 'investment-performance',
    journalPath: '/journal',
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      commodities: ['FUND_A', 'FUND_B'],
      excludeCommodities: ['SEK'],
    },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['investment-performance', '--file', '/journal']), {
    command: 'investment-performance',
    journalPath: '/journal',
    reportOptions: { accounts: [], commodities: [], excludeCommodities: [] },
    output: { csv: false, json: false },
  });
});

test('maps every remaining API parameter to CLI arguments', () => {
  assert.deepEqual(parseArguments([
    'aggregate', '--file', '/journal', '--with-valuation-value', '--json',
  ]), {
    command: 'aggregate',
    journalPath: '/journal',
    reportOptions: { accounts: [], withValuationValue: true },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['aggregate', '--file', '/journal', '--value', '--include-total']), {
    command: 'aggregate',
    journalPath: '/journal',
    reportOptions: { accounts: [], inValuationCommodity: true, includeTotal: true },
    output: { csv: false, json: false },
  });
  assert.deepEqual(parseArguments([
    'balance-history', '--file', '/journal', '--account-factor', 'Assets:Fund=0.7',
    '--account-factor', 'Assets:Cash=1', '--json',
  ]), {
    command: 'balance-history',
    journalPath: '/journal',
    reportOptions: {
      accounts: [],
      accountFactors: { 'Assets:Fund': '0.7', 'Assets:Cash': '1' },
    },
    output: { csv: false, json: true },
  });
  assert.deepEqual(parseArguments(['account-balances', '--file', '/journal', '--account', 'Assets:Cash', '--to', '2024-12-31']), {
    command: 'account-balances', journalPath: '/journal',
    options: { account: 'Assets:Cash', to: '2024-12-31' },
  });
  assert.deepEqual(parseArguments(['account-postings', '--file', '/journal', '--account', 'Assets:Cash', '--after', '2024-01-01']), {
    command: 'account-postings', journalPath: '/journal',
    options: { account: 'Assets:Cash', after: '2024-01-01' },
  });
  assert.deepEqual(parseArguments(['account-transactions', '--file', '/journal', '--account', 'Assets:Cash']), {
    command: 'account-transactions', journalPath: '/journal',
    options: { account: 'Assets:Cash' },
  });
  assert.deepEqual(parseArguments([
    'ledger-transactions', '--file', '/journal', '--order', 'oldest', '--page', '2', '--page-size', '25',
  ]), {
    command: 'ledger-transactions', journalPath: '/journal',
    options: { order: 'oldest', page: '2', pageSize: '25' },
  });
  assert.deepEqual(parseArguments(['ledger-transaction', '--file', '/journal', '--transaction-id', '42']), {
    command: 'ledger-transaction', journalPath: '/journal', options: { transactionId: '42' },
  });
  assert.deepEqual(parseArguments([
    'reconciliation-entries', '--file', '/journal',
    '--account', 'Assets:Cash', '--account', 'Assets:Bank', '--related',
  ]), {
    command: 'reconciliation-entries', journalPath: '/journal',
    options: { accounts: ['Assets:Cash', 'Assets:Bank'], related: true },
  });
  assert.deepEqual(parseArguments([
    'valuation-rate', '--file', '/journal', '--commodity', 'EUR', '--through-date', '2024-12-31',
  ]), {
    command: 'valuation-rate', journalPath: '/journal',
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
    ['reconciliation-entries', '--file', '/journal'],
  ];
  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseArguments(arguments_), /Usage:|may only be specified once/u);
  }
  assert.match(usage(), /^Usage: ledlight/u);
  assert.match(usage(), /--version\s+show the package version/u);
  assert.match(usage(), /--help\s+show help/u);
  assert.match(usage(), /ledlight <command> --help/u);
  assert.doesNotMatch(usage(), /database-path|ensure-database|open-journal/u);
  assert.doesNotMatch(usage(), /Usage: ledlight aggregate/u);
  assert.doesNotMatch(usage(), /--accounts <prefix>/u);
  assert.match(usage(), /--version[\s\S]*--help/u);
  assert.match(usage('aggregate'), /^Usage: ledlight aggregate --file <path> \[options\]/u);
  assert.match(usage('aggregate'), /--file <path>\s+\(required\) read the journal rooted at this file/u);
  assert.match(usage('aggregate'), /--accounts <prefix>.*repeatable/u);
  assert.match(
    usage('account-balances'),
    /^Usage: ledlight account-balances --file <path> --account <name> \[options\]/u,
  );
  assert.match(
    usage('account-balances'),
    /--account <name>\s+\(required\) select an exact account[\s\S]*--to <date>[\s\S]*--help/u,
  );
  assert.match(usage('aggregate'), /--help\s+show command help/u);
  assert.doesNotMatch(usage('aggregate'), /-h, --help/u);
  assert.doesNotMatch(usage(), /-V, --version/u);
  assert.throws(() => usage('missing'), /Unknown command: missing/u);
});
