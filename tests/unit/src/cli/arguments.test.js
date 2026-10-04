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
const { apiCommands, ledgerCommand, parseArguments, usage } = argumentsModule;

test('defines one CLI command for every journal operation', () => {
  assert.deepEqual(apiCommands, {
    accountPostings: 'account-postings',
    aggregateReport: 'summary',
    balanceHistoryReport: 'balance-history',
    unrealizedGains: 'unrealized-gains',
    investmentPerformance: 'investment-performance',
    accountTransactions: 'account-transactions',
    commodityDescriptions: 'commodity-descriptions',
    accounts: 'accounts',
    tags: 'tags',
    commodities: 'commodities',
    prices: 'prices',
    transactions: 'transactions',
    reconciliationEntries: 'reconciliation-entries',
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

test('tracks API inputs separately from CLI-only output inputs', () => {
  assert.deepEqual(argumentsModule.apiInputCoverage.accounts, {
    command: 'accounts',
    inputs: ['journalPath', 'accounts', 'usage'],
    outputInputs: ['details', 'format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.transactions, {
    command: 'transactions',
    inputs: ['journalPath', 'accounts', 'id', 'order', 'page', 'pageSize'],
    outputInputs: ['format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.aggregateReport.outputInputs, ['format']);
  assert.deepEqual(
    argumentsModule.apiInputCoverage.unrealizedGains.outputInputs,
    ['format', 'total'],
  );
  assert.deepEqual(argumentsModule.apiInputCoverage.balanceHistoryReport, {
    command: 'balance-history',
    inputs: ['journalPath', 'from', 'to', 'accounts', 'dateBasis', 'invert'],
    outputInputs: ['format'],
  });
});

test('parses account output options without adding API options', () => {
  assert.deepEqual(parseArguments(['accounts', '--file', '/journal']), {
    command: 'accounts',
    journalPath: '/journal',
    options: { accounts: [], usage: 'used' },
    output: { details: false, format: 'text' },
  });
  assert.deepEqual(parseArguments([
    'accounts', '--file', '/journal', '--accounts', '^Assets:',
    '--accounts', '^Expenses:', '--usage', 'unused', '--details', '--format', 'csv',
  ]), {
    command: 'accounts',
    journalPath: '/journal',
    options: { accounts: ['^Assets:', '^Expenses:'], usage: 'unused' },
    output: { details: true, format: 'csv' },
  });
  assert.throws(
    () => parseArguments(['accounts', '--file', '/journal', '--format', 'yaml']),
    /Allowed choices are text, json, csv/u,
  );
  assert.match(usage('accounts'), /--details\s+include comments and transaction counts/u);
  assert.match(usage('accounts'), /--format <format>\s+select the output format/u);
});

test('parses listing output formats and unused declaration selection', () => {
  for (const command of ['tags', 'commodities']) {
    assert.deepEqual(parseArguments([command, '--file', '/journal']), {
      command,
      journalPath: '/journal',
      options: { usage: 'used' },
      output: { format: 'text' },
    });
    assert.deepEqual(parseArguments([
      command, '--file', '/journal', '--usage', 'all', '--format', 'json',
    ]), {
      command,
      journalPath: '/journal',
      options: { usage: 'all' },
      output: { format: 'json' },
    });
    assert.throws(
      () => parseArguments([command, '--file', '/journal', '--format', 'yaml']),
      /Allowed choices are text, json, csv/u,
    );
    assert.match(usage(command), new RegExp(
      `^Usage: ledlight ${command} --file <path> \\[options\\]`, 'u',
    ));
  }
  assert.deepEqual(parseArguments(['prices', '--file', '/journal']), {
    command: 'prices',
    journalPath: '/journal',
    output: { format: 'text' },
  });
});

test('parses summary report options and output format', () => {
  assert.deepEqual(parseArguments([
    'summary',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--accounts', 'Liabilities:',
    '--value',
    '--invert',
    '--group-by', 'commodity',
    '--format', 'csv',
  ]), {
    command: 'summary',
    journalPath: '/journal',
    reportOptions: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:', 'Liabilities:'],
      inValuationCommodity: true,
      invert: true,
      groupBy: 'commodity',
    },
    output: { format: 'csv' },
  });
});

test('uses summary defaults when no options are supplied', () => {
  assert.deepEqual(parseArguments(['summary', '--file', '/journal']), {
    command: 'summary',
    journalPath: '/journal',
    reportOptions: { accounts: [] },
    output: { format: 'text' },
  });
});

test('parses --ledger as a CLI-only mode and renders supported base commands', () => {
  const accounts = parseArguments(['accounts', '--file', "/journals/O'Brien books.ledger", '--ledger']);
  assert.deepEqual(accounts, {
    command: 'accounts',
    journalPath: "/journals/O'Brien books.ledger",
    options: { accounts: [], usage: 'used' },
    output: { details: false, format: 'text' },
    ledger: true,
  });
  assert.equal(
    ledgerCommand(accounts),
    "ledger --args-only --no-pager --file '/journals/O'\\''Brien books.ledger' accounts",
  );

  const print = parseArguments(['print', '--file', '/journal', '--ledger']);
  assert.equal(ledgerCommand(print), 'ledger --args-only --no-pager --file /journal print');
  assert.equal(ledgerCommand(parseArguments([
    'accounts', '--file', '/journal', '--accounts', '^Assets:Cash$',
    '--accounts', "Expenses:O'Brien", '--ledger',
  ])), "ledger --args-only --no-pager --file /journal accounts '^Assets:Cash$' 'Expenses:O'\\''Brien'");
  assert.equal(ledgerCommand(parseArguments([
    'transactions', '--file', '/journal', '--accounts', 'Assets:Cash',
    '--accounts', 'Expenses:Food', '--ledger',
  ])), 'ledger --args-only --no-pager --file /journal print Assets:Cash Expenses:Food');
});

test('uses the CLI configuration file argument when --file is omitted', () => {
  const configuredArguments = createArguments({
    cliConfiguration: {
      apply: (arguments_) => [arguments_[0], '--file', '/configured-journal'],
    },
    project,
  });

  assert.deepEqual(configuredArguments.parseArguments(['summary']), {
    command: 'summary',
    journalPath: '/configured-journal',
    reportOptions: { accounts: [] },
    output: { format: 'text' },
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
    '--format', 'csv',
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
    output: { format: 'csv' },
  });
  assert.throws(() => parseArguments(['balance-history', '--value']), /Usage:/u);
  assert.throws(() => parseArguments(['balance-history', '--account-factor', 'Assets:=1']), /Usage:/u);
  assert.throws(() => parseArguments(['balance-history', '--csv']), /Usage:/u);
  assert.throws(() => parseArguments(['balance-history', '--json']), /Usage:/u);
});

test('parses unrealized gains options and CLI-only output controls', () => {
  assert.deepEqual(parseArguments([
    'unrealized-gains',
    '--file', '/journal',
    '--at', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--format', 'csv',
    '--total',
  ]), {
    command: 'unrealized-gains',
    journalPath: '/journal',
    reportOptions: {
      at: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
    },
    output: { format: 'csv', total: true },
  });
  assert.deepEqual(parseArguments(['unrealized-gains', '--file', '/journal']), {
    command: 'unrealized-gains',
    journalPath: '/journal',
    reportOptions: { accounts: [] },
    output: { format: 'text', total: false },
  });
  assert.deepEqual(
    parseArguments(['unrealized-gains', '--file', '/journal', '--format', 'json']).output,
    { format: 'json', total: false },
  );
  assert.throws(
    () => parseArguments(['unrealized-gains', '--file', '/journal', '--format', 'yaml']),
    /Allowed choices are text, json, csv/u,
  );
  for (const option of ['--csv', '--json', '--from', '--to']) {
    assert.throws(
      () => parseArguments(['unrealized-gains', '--file', '/journal', option, '2024-01-01']),
      /Usage:/u,
    );
  }
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
    'summary', '--file', '/journal', '--with-valuation-value', '--format', 'json',
  ]), {
    command: 'summary',
    journalPath: '/journal',
    reportOptions: { accounts: [], withValuationValue: true },
    output: { format: 'json' },
  });
  assert.deepEqual(parseArguments(['summary', '--file', '/journal', '--value', '--include-total']), {
    command: 'summary',
    journalPath: '/journal',
    reportOptions: { accounts: [], inValuationCommodity: true, includeTotal: true },
    output: { format: 'text' },
  });
  assert.deepEqual(parseArguments([
    'balance-history', '--file', '/journal', '--accounts', 'Assets:Fund',
    '--accounts', 'Assets:Cash', '--format', 'json',
  ]), {
    command: 'balance-history',
    journalPath: '/journal',
    reportOptions: {
      accounts: ['Assets:Fund', 'Assets:Cash'],
    },
    output: { format: 'json' },
  });
  assert.throws(
    () => parseArguments([
      'summary', '--file', '/journal', '--format', 'yaml',
    ]),
    /Allowed choices are text, json, csv/u,
  );
  assert.deepEqual(parseArguments(['account-postings', '--file', '/journal', '--accounts', 'Assets:Cash', '--accounts', 'Assets:Bank', '--after', '2024-01-01']), {
    command: 'account-postings', journalPath: '/journal',
    options: { accounts: ['Assets:Cash', 'Assets:Bank'], after: '2024-01-01' },
  });
  assert.deepEqual(parseArguments(['account-transactions', '--file', '/journal', '--accounts', 'Assets:Cash', '--accounts', 'Assets:Bank']), {
    command: 'account-transactions', journalPath: '/journal',
    options: { accounts: ['Assets:Cash', 'Assets:Bank'] },
  });
  assert.deepEqual(parseArguments([
    'transactions', '--file', '/journal', '--accounts', 'Assets:Cash',
    '--accounts', 'Assets:Bank',
    '--id', '42', '--order', 'oldest', '--page', '2',
    '--page-size', '25', '--format', 'csv',
  ]), {
    command: 'transactions', journalPath: '/journal',
    options: {
      accounts: ['Assets:Cash', 'Assets:Bank'], id: '42', order: 'oldest', page: '2', pageSize: '25',
    },
    output: { format: 'csv' },
  });
  assert.deepEqual(parseArguments(['transactions', '--file', '/journal']), {
    command: 'transactions', journalPath: '/journal',
    options: { accounts: [] }, output: { format: 'text' },
  });
  assert.deepEqual(parseArguments(['print', '--file', '/journal']), {
    command: 'transactions', journalPath: '/journal',
    options: { accounts: [] }, output: { format: 'text' },
  });
  assert.deepEqual(parseArguments([
    'reconciliation-entries', '--file', '/journal',
    '--account', 'Assets:Cash', '--account', 'Assets:Bank', '--related',
  ]), {
    command: 'reconciliation-entries', journalPath: '/journal',
    options: { accounts: ['Assets:Cash', 'Assets:Bank'], related: true },
  });
});

test('rejects missing commands, values, duplicate dates, and unknown options', () => {
  const invalidArguments = [
    [],
    ['account-balances'],
    ['aggregate'],
    ['ledger-transactions', '--file', '/journal'],
    ['summary', '--from'],
    ['summary', '--from', '--value'],
    ['summary', '--to', '2024-01-01', '--to', '2024-02-01'],
    ['summary', '--date-basis', 'other'],
    ['summary', '--date-basis', 'posting', '--date-basis', 'transaction'],
    ['summary', '--group-by', 'currency'],
    ['summary', '--unknown'],
    ['investment-performance', '--commodities'],
    ['investment-performance', '--from', '2024-01-01', '--from', '2024-02-01'],
    ['investment-performance', '--csv'],
    ['unrealized-gains', '--value'],
    ['reconciliation-entries', '--file', '/journal'],
  ];
  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseArguments(arguments_), /Usage:|may only be specified once/u);
  }
  assert.match(usage(), /^Usage: ledlight <command> \[options\]/u);
  assert.match(usage(), /--version\s+show the package version/u);
  assert.match(usage(), /--help\s+show help/u);
  assert.match(usage(), /ledlight <command> --help/u);
  assert.match(
    usage(),
    /raw:\n {2}accounts\s+show used accounts[\s\S]* {2}tags\s+show used tags[\s\S]* {2}commodities\s+show used commodities[\s\S]* {2}prices\s+show market prices[\s\S]* {2}transactions\|print\s+show transactions/u,
  );
  assert.match(
    usage(),
    /reports:\n {2}summary\s+summarize postings[\s\S]* {2}balance-history\s+show balances over time[\s\S]* {2}unrealized-gains\s+show unrealized investment gains/u,
  );
  assert.match(
    usage(),
    /misc:[\s\S]* {2}investment-performance\s+show investment performance/u,
  );
  assert.doesNotMatch(usage(), /Commands:/u);
  assert.match(usage(), /transactions\|print\s+show transactions/u);
  assert.doesNotMatch(usage(), /^ {2}\S+ \[options\]/mu);
  assert.doesNotMatch(usage(), /database-path|ensure-database|open-journal/u);
  assert.doesNotMatch(usage(), /Usage: ledlight aggregate/u);
  assert.doesNotMatch(usage(), /--accounts <pattern>/u);
  assert.match(usage(), /--version[\s\S]*--help/u);
  assert.match(usage('summary'), /^Usage: ledlight summary --file <path> \[options\]/u);
  assert.match(usage('print'), /^Usage: ledlight transactions\|print --file <path> \[options\]/u);
  assert.match(usage('print'), /--accounts <pattern>.*repeatable/u);
  assert.match(usage('summary'), /--file <path>\s+\(REQUIRED\) read the journal rooted at this file/u);
  assert.match(usage('summary'), /--accounts <pattern>.*repeatable/u);
  assert.match(
    usage('summary'),
    /^Usage: ledlight summary --file <path> \[options\]/u,
  );
  assert.match(
    usage('summary'),
    /--accounts <pattern>[\s\S]*--group-by <dimension>[\s\S]*--format <format>[\s\S]*--help/u,
  );
  assert.match(
    usage('investment-performance'),
    /Return measures:[\s\S]*Time-weighted return[\s\S]*end of the day[\s\S]*Money-weighted return \(total\)[\s\S]*first to the last[\s\S]*Money-weighted return \(annualized\)[\s\S]*present value/u,
  );
  assert.match(usage('summary'), /--help\s+show command help/u);
  assert.match(
    usage('summary'),
    /--ledger\s+show the equivalent standalone Ledger command/u,
  );
  assert.doesNotMatch(usage('summary'), /-h, --help/u);
  assert.doesNotMatch(usage(), /-V, --version/u);
  assert.throws(() => usage('missing'), /Unknown command: missing/u);
});
