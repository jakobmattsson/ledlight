'use strict';

const { resolveCommands, resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const commander = require('commander');
const { Command } = commander;
const createArguments = require('../../../../src/impl/cli/cli-arguments');
const commands = resolveCommands();
const project = resolveRepositoryModule('src/impl/core/project.js');
const argumentsModule = createArguments({
  commander,
  commands,
  cliConfiguration: { apply: (arguments_) => arguments_ },
  project,
});
const { parseArguments, usage } = argumentsModule;

function withoutCliOptions(value) {
  const parsed = { ...value };
  delete parsed.cliOptions;
  return parsed;
}

function apiArguments(arguments_) {
  return withoutCliOptions(parseArguments(arguments_));
}

test('documents the effective default for every enum option in command help', () => {
  for (const definition of commands) {
    const command = definition.name;
    const configured = new Command(command);
    definition.configure(configured);
    const parsed = parseArguments([
      command, '--file', '/journal',
    ]);
    const options = { ...parsed.options, ...parsed.cliOptions };
    const help = usage(command);
    for (const option of configured.options.filter((candidate) => candidate.argChoices)) {
      const flag = option.long;
      const input = option.attributeName();
      const optionHelp = help.split(/\n(?= {2}--)/u)
        .find((entry) => entry.startsWith(`  ${flag} `));
      assert.ok(optionHelp, `${command} ${flag} must appear in help`);
      for (const choice of option.argChoices) {
        assert.match(optionHelp, new RegExp(`"${choice}"`, 'u'), `${command} ${flag}`);
      }
      const documentedDefault = /default:\s+"([^"]+)"/u.exec(optionHelp);
      assert.ok(documentedDefault, `${command} ${flag} must document its default`);
      assert.equal(documentedDefault[1], options[input], `${command} ${flag}`);
    }
  }
});

test('shows a runnable example in every command help page', () => {
  for (const { name, examples } of commands) {
    assert.ok(Array.isArray(examples) && examples.length > 0, name);
    const help = usage(name);
    assert.match(help, /\n\nExamples:\n/u, name);
    for (const example of examples) {
      assert.ok(example.startsWith(`ledlight ${name} --file `), example);
      assert.ok(help.includes(`  ${example}`), example);
    }
  }
});

test('parses account output options without adding API options', () => {
  assert.deepEqual(apiArguments(['accounts', '--file', '/journal']), {
    command: 'accounts',
    journalPath: '/journal',
    options: { usage: 'used' },
  });
  assert.deepEqual(apiArguments([
    'accounts', '--file', '/journal', '--accounts', '^Assets:',
    '--accounts', '^Expenses:', '--usage', 'unused', '--details', '--format', 'csv',
  ]), {
    command: 'accounts',
    journalPath: '/journal',
    options: { accounts: ['^Assets:', '^Expenses:'], usage: 'unused' },
  });
  assert.throws(
    () => parseArguments(['accounts', '--file', '/journal', '--format', 'yaml']),
    /Allowed choices are text, json, csv/u,
  );
  assert.match(usage('accounts'), /--details\s+include comments and transaction counts/u);
  assert.match(usage('accounts'), /--format <format>\s+select the output format/u);
});

test('passes Commander options directly to command output formatting', () => {
  const parsed = parseArguments([
    'accounts', '--file', '/journal', '--accounts', 'Assets:', '--details', '--format', 'csv',
  ]);
  assert.deepEqual(parsed.cliOptions, {
    file: '/journal',
    accounts: ['Assets:'],
    usage: 'used',
    details: true,
    format: 'csv',
  });
  assert.deepEqual(parsed.options, { accounts: ['Assets:'], usage: 'used' });
});

test('parses listing output formats and unused declaration selection', () => {
  for (const command of ['tags', 'commodities']) {
    assert.deepEqual(apiArguments([command, '--file', '/journal']), {
      command,
      journalPath: '/journal',
      options: { usage: 'used' },
    });
    assert.deepEqual(apiArguments([
      command, '--file', '/journal', '--usage', 'all', '--format', 'json',
    ]), {
      command,
      journalPath: '/journal',
      options: { usage: 'all' },
    });
    assert.throws(
      () => parseArguments([command, '--file', '/journal', '--format', 'yaml']),
      /Allowed choices are text, json, csv/u,
    );
    assert.match(usage(command), new RegExp(
      `^Usage: ledlight ${command} --file <path> \\[options\\]`, 'u',
    ));
  }
  assert.deepEqual(apiArguments([
    'commodities', '--file', '/journal', '--usage', 'all', '--details', '--format', 'csv',
  ]), {
    command: 'commodities',
    journalPath: '/journal',
    options: { usage: 'all' },
  });
  assert.match(usage('commodities'), /--details\s+include comments, formats, and usage/u);
  assert.deepEqual(apiArguments(['prices', '--file', '/journal']), {
    command: 'prices',
    journalPath: '/journal',
    options: { mode: 'effective' },
  });
  assert.deepEqual(apiArguments([
    'prices', '--file', '/journal', '--mode', 'directives', '--format', 'json',
  ]), {
    command: 'prices',
    journalPath: '/journal',
    options: { mode: 'directives' },
  });
});

test('parses aggregate report options and output format', () => {
  assert.deepEqual(apiArguments([
    'aggregate',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--accounts', 'Liabilities:',
    '--denominate',
    '--invert',
    '--group-by', 'commodity',
    '--format', 'csv',
  ]), {
    command: 'aggregate',
    journalPath: '/journal',
    options: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:', 'Liabilities:'],
      dateBasis: 'posting', valuation: 'market',
      denominate: true,
      invert: true,
      groupBy: 'commodity',
    },
  });
});

test('uses aggregate defaults when no options are supplied', () => {
  assert.deepEqual(apiArguments(['aggregate', '--file', '/journal']), {
    command: 'aggregate',
    journalPath: '/journal',
    options: { dateBasis: 'posting', valuation: 'market', groupBy: 'account' },
  });
});

test('parses valuation choices and explicitly passes the market default', () => {
  for (const command of ['aggregate', 'total-history']) {
    const arguments_ = [command, '--file', '/journal'];
    assert.equal(parseArguments(arguments_).options.valuation, 'market');
    for (const valuation of ['cost', 'market']) {
      assert.equal(parseArguments([...arguments_, '--valuation', valuation]).options.valuation, valuation);
    }
    assert.throws(() => parseArguments([...arguments_, '--valuation', 'book']),
      /Allowed choices are cost, market/u);
    assert.throws(() => parseArguments([...arguments_, '--valuation']), /argument missing/u);
    assert.throws(() => parseArguments([...arguments_, '--valuation', 'cost', '--valuation', 'market']),
      /--valuation may only be specified once/u);
  }
});

test('uses the CLI configuration file argument when --file is omitted', () => {
  const configuredArguments = createArguments({
    commander,
    commands,
    cliConfiguration: {
      apply: (arguments_) => [arguments_[0], '--file', '/configured-journal'],
    },
    project,
  });

  assert.deepEqual(withoutCliOptions(configuredArguments.parseArguments(['aggregate'])), {
    command: 'aggregate',
    journalPath: '/configured-journal',
    options: { dateBasis: 'posting', valuation: 'market', groupBy: 'account' },
  });
});

test('parses total history options', () => {
  assert.deepEqual(apiArguments([
    'total-history',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--invert',
    '--format', 'csv',
  ]), {
    command: 'total-history',
    journalPath: '/journal',
    options: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction', valuation: 'market',
      invert: true,
    },
  });
  assert.throws(() => parseArguments(['total-history', '--denominate']), /Usage:/u);
  assert.throws(() => parseArguments(['total-history', '--account-factor', 'Assets:=1']), /Usage:/u);
  assert.throws(() => parseArguments(['total-history', '--csv']), /Usage:/u);
  assert.throws(() => parseArguments(['total-history', '--json']), /Usage:/u);
});

test('parses unrealized gains options and CLI-only output controls', () => {
  assert.deepEqual(apiArguments([
    'unrealized-gains',
    '--file', '/journal',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--date-basis', 'transaction',
    '--format', 'csv',
    '--include-total',
  ]), {
    command: 'unrealized-gains',
    journalPath: '/journal',
    options: {
      to: '2024-12-31',
      accounts: ['Assets:'],
      dateBasis: 'transaction',
    },
  });
  assert.deepEqual(apiArguments(['unrealized-gains', '--file', '/journal']), {
    command: 'unrealized-gains',
    journalPath: '/journal',
    options: { dateBasis: 'posting' },
  });
  assert.deepEqual(
    parseArguments(['unrealized-gains', '--file', '/journal', '--format', 'json'])
      .cliOptions.format,
    'json',
  );
  assert.throws(
    () => parseArguments(['unrealized-gains', '--file', '/journal', '--format', 'yaml']),
    /Allowed choices are text, json, csv/u,
  );
  for (const option of ['--csv', '--json', '--from', '--at']) {
    assert.throws(
      () => parseArguments(['unrealized-gains', '--file', '/journal', option, '2024-01-01']),
      /Usage:/u,
    );
  }
});

test('uses the same total flag for both reports without requiring valuation', () => {
  for (const command of ['aggregate', 'unrealized-gains']) {
    const parsed = parseArguments([command, '--file', '/journal', '--include-total']);
    assert.equal((command === 'aggregate' ? parsed.options : parsed.cliOptions).includeTotal, true);
    assert.equal(parsed.options.denominate, undefined);
    assert.match(usage(command), /--include-total/u);
    assert.doesNotMatch(usage(command), /--total\b|requires --denominate/u);
    assert.throws(() => parseArguments([command, '--file', '/journal', '--total']), /unknown option/u);
  }
});

test('parses investment performance selections and output format', () => {
  assert.deepEqual(apiArguments([
    'investment-performance',
    '--file', '/journal',
    '--from', '2024-01-01',
    '--to', '2024-12-31',
    '--accounts', 'Assets:',
    '--commodities', 'FUND_A',
    '--commodities', '~FUND_B',
    '--format', 'json',
  ]), {
    command: 'investment-performance',
    journalPath: '/journal',
    options: {
      from: '2024-01-01',
      to: '2024-12-31',
      accounts: ['Assets:'],
      commodities: ['FUND_A', '~FUND_B'],
    },
  });
  assert.deepEqual(apiArguments([
    'investment-performance', '--file', '/journal', '--commodities', '~SEK',
  ]), {
    command: 'investment-performance',
    journalPath: '/journal',
    options: { commodities: ['~SEK'] },
  });
  assert.deepEqual(apiArguments([
    'investment-performance', '--file', '/journal',
    '--commodities', '^FUND', '--commodities', '~B$',
  ]).options.commodities, ['^FUND', '~B$']);
  assert.throws(() => parseArguments([
    'investment-performance', '--file', '/journal', '--include-commodities', 'FUND',
  ]), /unknown option/u);
  assert.deepEqual(apiArguments(['investment-performance', '--file', '/journal']), {
    command: 'investment-performance',
    journalPath: '/journal',
    options: {},
  });
  assert.equal(parseArguments(['investment-performance', '--file', '/journal']).cliOptions.format, 'text');
  assert.equal(parseArguments([
    'investment-performance', '--file', '/journal', '--format', 'csv',
  ]).cliOptions.format, 'csv');
  assert.throws(() => parseArguments(['investment-performance', '--file', '/journal', '--json']),
    /unknown option/u);
  assert.throws(() => parseArguments([
    'investment-performance', '--file', '/journal', '--format', 'yaml',
  ]), /Allowed choices are text, json, csv/u);
});

test('maps every remaining API parameter to CLI arguments', () => {
  assert.deepEqual(apiArguments([
    'aggregate', '--file', '/journal', '--with-valuation-value', '--format', 'json',
  ]), {
    command: 'aggregate',
    journalPath: '/journal',
    options: {
      dateBasis: 'posting', valuation: 'market', groupBy: 'account', withValuationValue: true,
    },
  });
  assert.deepEqual(apiArguments(['aggregate', '--file', '/journal', '--denominate', '--include-total']), {
    command: 'aggregate',
    journalPath: '/journal',
    options: {
      dateBasis: 'posting', valuation: 'market', groupBy: 'account',
      denominate: true, includeTotal: true,
    },
  });
  assert.deepEqual(apiArguments([
    'total-history', '--file', '/journal', '--accounts', 'Assets:Fund',
    '--accounts', 'Assets:Cash', '--format', 'json',
  ]), {
    command: 'total-history',
    journalPath: '/journal',
    options: {
      accounts: ['Assets:Fund', 'Assets:Cash'],
      dateBasis: 'posting', valuation: 'market',
    },
  });
  assert.throws(
    () => parseArguments([
      'aggregate', '--file', '/journal', '--format', 'yaml',
    ]),
    /Allowed choices are text, json, csv/u,
  );
  assert.deepEqual(apiArguments([
    'transactions', '--file', '/journal', '--accounts', 'Assets:Cash',
    '--accounts', 'Assets:Bank',
    '--id', '42', '--order', 'oldest', '--page', '2',
    '--page-size', '25', '--format', 'csv',
  ]), {
    command: 'transactions', journalPath: '/journal',
    options: {
      accounts: ['Assets:Cash', 'Assets:Bank'], id: '42', order: 'oldest', page: '2', pageSize: '25',
    },
  });
  assert.deepEqual(apiArguments(['transactions', '--file', '/journal']), {
    command: 'transactions', journalPath: '/journal',
    options: { order: 'oldest' },
  });
  assert.deepEqual(apiArguments([
    'postings', '--file', '/journal', '--from', '2024-01-01', '--to', '2024-01-31',
    '--accounts', 'Assets:Cash', '--accounts', 'Expenses:', '--format', 'csv',
  ]), {
    command: 'postings', journalPath: '/journal',
    options: {
      from: '2024-01-01', to: '2024-01-31', accounts: ['Assets:Cash', 'Expenses:'],
    },
  });
  assert.deepEqual(apiArguments(['postings', '--file', '/journal']), {
    command: 'postings', journalPath: '/journal',
    options: {},
  });
  assert.match(
    usage('transactions'),
    /--order <order>\s+sort transactions by journal entry order \(choices:\s+"newest", "oldest", default:\s+"oldest"\)/u,
  );
  assert.match(usage('transactions'), /--page-size <number>\s+set the page size/u);
});

test('rejects missing commands, values, duplicate dates, and unknown options', () => {
  const invalidArguments = [
    [],
    ['account-balances'],
    ['aggregate'],
    ['ledger-transactions', '--file', '/journal'],
    ['print', '--file', '/journal', '--format', 'json'],
    ['aggregate', '--from'],
    ['aggregate', '--from', '--denominate'],
    ['aggregate', '--to', '2024-01-01', '--to', '2024-02-01'],
    ['aggregate', '--date-basis', 'other'],
    ['aggregate', '--date-basis', 'posting', '--date-basis', 'transaction'],
    ['aggregate', '--group-by', 'currency'],
    ['aggregate', '--unknown'],
    ['aggregate', '--file', '/journal', '--account', 'Assets:Cash'],
    ['investment-performance', '--commodities'],
    ['investment-performance', '--from', '2024-01-01', '--from', '2024-02-01'],
    ['investment-performance', '--csv'],
    ['unrealized-gains', '--denominate'],
    ['reconciliation-entries', '--file', '/journal', '--account', 'Assets:Cash'],
  ];
  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseArguments(arguments_), /Usage:|may only be specified once/u);
  }
  assert.match(usage(), /^Usage: ledlight <command> \[options\]/u);
  assert.match(usage(), /--version\s+show the package version/u);
  assert.match(usage(), /--help\s+show help/u);
  assert.match(usage(), /ledlight <command> --help/u);
  assert.match(usage(), /Example:\n {2}ledlight aggregate --file main\.ledger/u);
  assert.match(
    usage(),
    /raw:\n {2}accounts\s+show accounts[\s\S]* {2}commodities\s+show commodities[\s\S]* {2}postings\s+show postings[\s\S]* {2}prices\s+show prices[\s\S]* {2}tags\s+show tags[\s\S]* {2}transactions\s+show transactions/u,
  );
  assert.match(
    usage(),
    /reports:\n {2}aggregate\s+aggregate postings[\s\S]* {2}investment-performance\s+show investment performance[\s\S]* {2}total-history\s+show daily closing totals[\s\S]* {2}unrealized-gains\s+show unrealized investment gains/u,
  );
  assert.doesNotMatch(usage(), /misc:/u);
  assert.doesNotMatch(usage(), /Commands:/u);
  assert.match(usage(), /transactions\s+show transactions/u);
  assert.match(usage(), /presentation:\n {2}print\s+pretty-print the complete journal/u);
  assert.doesNotMatch(usage(), /transactions\|print/u);
  assert.doesNotMatch(usage(), /^ {2}\S+ \[options\]/mu);
  assert.doesNotMatch(usage(), /database-path|ensure-database|open-journal/u);
  assert.doesNotMatch(usage(), /Usage: ledlight aggregate/u);
  assert.doesNotMatch(usage(), /--accounts <pattern>/u);
  assert.match(usage(), /--version[\s\S]*--help/u);
  assert.match(usage('aggregate'), /^Usage: ledlight aggregate --file <path> \[options\]/u);
  assert.match(usage('print'), /^Usage: ledlight print --file <path> \[options\]/u);
  assert.match(usage('aggregate'), /--file <path>\s+\(REQUIRED\) read this journal file, or - for stdin/u);
  assert.match(usage('aggregate'), /--accounts <pattern>.*repeatable/u);
  assert.match(
    usage('aggregate'),
    /^Usage: ledlight aggregate --file <path> \[options\]/u,
  );
  assert.match(
    usage('aggregate'),
    /--accounts <pattern>[\s\S]*--group-by <dimension>[\s\S]*--format <format>[\s\S]*--help/u,
  );
  assert.match(
    usage('investment-performance'),
    /Return measures:[\s\S]*Time-weighted return \(total\)[\s\S]*compare portfolio performance[\s\S]*The method splits the[\s\S]*external contribution or withdrawal[\s\S]*multiplies the parts' growth factors[\s\S]*daily closing values[\s\S]*day's end[\s\S]*Money-weighted return \(total\)[\s\S]*your own cumulative return[\s\S]*first to the last[\s\S]*Money-weighted return \(annualized\)[\s\S]*compare your own returns across periods of different lengths[\s\S]*present value/u,
  );
  assert.match(usage('investment-performance'), /Time-weighted return \(annualized\)[\s\S]*yearly compound rate/u);
  assert.match(usage('aggregate'), /--help\s+show command help/u);
  assert.doesNotMatch(usage('aggregate'), /-h, --help/u);
  assert.doesNotMatch(usage(), /-V, --version/u);
  assert.throws(() => usage('missing'), /Unknown command: missing/u);
});

test('validates usage choices and repeated values consistently with other enum options', () => {
  for (const command of ['accounts', 'commodities', 'tags']) {
    assert.throws(() => parseArguments([command, '--file', '/journal', '--usage', 'invalid']),
      /Allowed choices are all, used, unused/u);
    assert.throws(() => parseArguments([
      command, '--file', '/journal', '--usage', 'all', '--usage', 'used',
    ]), /--usage may only be specified once/u);
  }
});
