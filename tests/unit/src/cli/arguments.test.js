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
    summary: 'summary',
    balanceHistoryReport: 'balance-history',
    unrealizedGains: 'unrealized-gains',
    investmentPerformance: 'investment-performance',
    accounts: 'accounts',
    tags: 'tags',
    commodities: 'commodities',
    prices: 'prices',
    transactions: 'transactions',
    postings: 'postings',
  });
});

test('fails when a locally declared API input has no actual CLI option', () => {
  const apiDefinitions = {
    ...project.apiDefinitions,
    summary: {
      inputs: [...project.apiDefinitions.summary.inputs, 'futureOption'],
    },
  };
  assert.throws(
    () => createArguments({
      cliConfiguration: { apply: (arguments_) => arguments_ },
      project: { apiDefinitions },
    }),
    /CLI inputs do not cover the summary API contract/u,
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
  assert.deepEqual(argumentsModule.apiInputCoverage.postings, {
    command: 'postings',
    inputs: ['journalPath', 'from', 'to', 'accounts'],
    outputInputs: ['format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.summary.outputInputs, ['format']);
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

test('documents the effective default for every enum option in command help', () => {
  for (const command of Object.values(apiCommands)) {
    const parsed = parseArguments([
      command, '--file', '/journal',
    ]);
    const options = { ...parsed.options, ...parsed.reportOptions, ...parsed.output };
    const helpOptions = usage(command).split(/\n(?= {2}--)/u).slice(1);
    for (const helpOption of helpOptions.filter((entry) => entry.includes('(choices:'))) {
      const flag = /^ {2}--([\w-]+)/u.exec(helpOption)[1];
      const input = flag.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
      const documentedDefault = /default:\s+"([^"]+)"/u.exec(helpOption);
      assert.ok(documentedDefault, `${command} --${flag} must document its default`);
      assert.equal(documentedDefault[1], options[input], `${command} --${flag}`);
    }
  }
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
    const output = command === 'commodities'
      ? { details: false, format: 'text' }
      : { format: 'text' };
    assert.deepEqual(parseArguments([command, '--file', '/journal']), {
      command,
      journalPath: '/journal',
      options: { usage: 'used' },
      output,
    });
    const jsonOutput = command === 'commodities'
      ? { details: false, format: 'json' }
      : { format: 'json' };
    assert.deepEqual(parseArguments([
      command, '--file', '/journal', '--usage', 'all', '--format', 'json',
    ]), {
      command,
      journalPath: '/journal',
      options: { usage: 'all' },
      output: jsonOutput,
    });
    assert.throws(
      () => parseArguments([command, '--file', '/journal', '--format', 'yaml']),
      /Allowed choices are text, json, csv/u,
    );
    assert.match(usage(command), new RegExp(
      `^Usage: ledlight ${command} --file <path> \\[options\\]`, 'u',
    ));
  }
  assert.deepEqual(parseArguments([
    'commodities', '--file', '/journal', '--usage', 'all', '--details', '--format', 'csv',
  ]), {
    command: 'commodities',
    journalPath: '/journal',
    options: { usage: 'all' },
    output: { details: true, format: 'csv' },
  });
  assert.match(usage('commodities'), /--details\s+include comments, formats, and usage/u);
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
      dateBasis: 'posting',
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
    reportOptions: { accounts: [], dateBasis: 'posting', groupBy: 'account' },
    output: { format: 'text' },
  });
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
    reportOptions: { accounts: [], dateBasis: 'posting', groupBy: 'account' },
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
    reportOptions: { accounts: [], dateBasis: 'posting' },
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
    reportOptions: {
      accounts: [], dateBasis: 'posting', groupBy: 'account', withValuationValue: true,
    },
    output: { format: 'json' },
  });
  assert.deepEqual(parseArguments(['summary', '--file', '/journal', '--value', '--include-total']), {
    command: 'summary',
    journalPath: '/journal',
    reportOptions: {
      accounts: [], dateBasis: 'posting', groupBy: 'account',
      inValuationCommodity: true, includeTotal: true,
    },
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
      dateBasis: 'posting',
    },
    output: { format: 'json' },
  });
  assert.throws(
    () => parseArguments([
      'summary', '--file', '/journal', '--format', 'yaml',
    ]),
    /Allowed choices are text, json, csv/u,
  );
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
    options: { accounts: [], order: 'oldest' },
    output: { format: 'text' },
  });
  assert.deepEqual(parseArguments([
    'postings', '--file', '/journal', '--from', '2024-01-01', '--to', '2024-01-31',
    '--accounts', 'Assets:Cash', '--accounts', 'Expenses:', '--format', 'csv',
  ]), {
    command: 'postings', journalPath: '/journal',
    options: {
      from: '2024-01-01', to: '2024-01-31', accounts: ['Assets:Cash', 'Expenses:'],
    },
    output: { format: 'csv' },
  });
  assert.deepEqual(parseArguments(['postings', '--file', '/journal']), {
    command: 'postings', journalPath: '/journal',
    options: { accounts: [] }, output: { format: 'text' },
  });
  assert.match(
    usage('transactions'),
    /--order <order>\s+sort transactions \(choices: "newest", "oldest", default:\s+"oldest"\)/u,
  );
  assert.match(usage('transactions'), /--page-size <number>\s+set the page size/u);
});

test('rejects missing commands, values, duplicate dates, and unknown options', () => {
  const invalidArguments = [
    [],
    ['account-balances'],
    ['aggregate'],
    ['ledger-transactions', '--file', '/journal'],
    ['print', '--file', '/journal'],
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
    ['reconciliation-entries', '--file', '/journal', '--account', 'Assets:Cash'],
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
    /raw:\n {2}accounts\s+show used accounts[\s\S]* {2}tags\s+show used tags[\s\S]* {2}commodities\s+show used commodities[\s\S]* {2}prices\s+show market prices[\s\S]* {2}transactions\s+show transactions/u,
  );
  assert.match(
    usage(),
    /reports:\n {2}summary\s+summarize postings[\s\S]* {2}balance-history\s+show balances over time[\s\S]* {2}unrealized-gains\s+show unrealized investment gains[\s\S]* {2}investment-performance\s+show investment performance/u,
  );
  assert.match(
    usage(),
    /misc:/u,
  );
  assert.doesNotMatch(usage(), /Commands:/u);
  assert.match(usage(), /transactions\s+show transactions/u);
  assert.doesNotMatch(usage(), /transactions\|print/u);
  assert.doesNotMatch(usage(), /^ {2}\S+ \[options\]/mu);
  assert.doesNotMatch(usage(), /database-path|ensure-database|open-journal/u);
  assert.doesNotMatch(usage(), /Usage: ledlight aggregate/u);
  assert.doesNotMatch(usage(), /--accounts <pattern>/u);
  assert.match(usage(), /--version[\s\S]*--help/u);
  assert.match(usage('summary'), /^Usage: ledlight summary --file <path> \[options\]/u);
  assert.throws(() => usage('print'), /Unknown command: print/u);
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
  assert.doesNotMatch(usage('summary'), /-h, --help/u);
  assert.doesNotMatch(usage(), /-V, --version/u);
  assert.throws(() => usage('missing'), /Unknown command: missing/u);
});
