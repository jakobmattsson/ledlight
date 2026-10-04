'use strict';

const assert = require('node:assert/strict');
const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const cliPath = path.join(repositoryRoot, 'src/cli/run.js');
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/ledger-compatibility');
const ledgerBinary = process.env.LEDGER_BIN ?? 'ledger';

function temporaryProject(t, fixture) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-ledger-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(fixtureRoot, fixture), directory, { recursive: true });
  return directory;
}

function temporaryJournal(t, sourceText) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-ledger-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'journal.ledger'), sourceText);
  return directory;
}

function exactCommandOutput(projectDirectory, executable, arguments_) {
  return execFileSync(executable, arguments_, {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  });
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else field += character;
  }
  fields.push(field);
  return fields;
}

function normalizeDecimal(value) {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/u.exec(value);
  assert.ok(match, `Expected a plain decimal, received ${JSON.stringify(value)}`);
  const integer = match[2].replace(/^0+(?=\d)/u, '');
  const fraction = (match[3] ?? '').replace(/0+$/u, '');
  const unsigned = fraction ? `${integer}.${fraction}` : integer;
  return `${match[1] && unsigned !== '0' ? '-' : ''}${unsigned}`;
}

function normalizedRows(rows) {
  return rows
    .map(({ account, quantity, commodity }) => ({
      account,
      quantity: normalizeDecimal(quantity),
      commodity,
    }))
    .sort((left, right) =>
      left.account.localeCompare(right.account, 'en') ||
      left.commodity.localeCompare(right.commodity, 'en'));
}

function runLedlight(projectDirectory, arguments_) {
  const output = execFileSync(process.execPath, [
    cliPath,
    ...arguments_,
    '--file',
    path.join(projectDirectory, 'journal.ledger'),
  ], {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  });
  const [header, ...lines] = output.trimEnd().split('\n');
  assert.equal(header, 'account,amount,commodity');
  return normalizedRows(lines.filter(Boolean).map((line) => {
    const [account, quantity, commodity] = parseCsvLine(line);
    return { account, quantity, commodity };
  }));
}

function runLedger(projectDirectory, { options, queries }) {
  const output = execFileSync(ledgerBinary, [
    '--args-only',
    '--file',
    'journal.ledger',
    ...options,
    '--sort',
    'account',
    'balance',
    '--flat',
    '--no-total',
    '--format',
    '%(account)\t%(quantity(scrub(display_total)))\t%(commodity(scrub(display_total)))\n',
    ...queries,
  ], {
    cwd: projectDirectory,
    encoding: 'utf8',
  });
  return normalizedRows(output.trimEnd().split('\n').filter(Boolean).map((line) => {
    const [account, quantity, commodity] = line.split('\t');
    return { account, quantity, commodity };
  }));
}

test('transactions defaults to the exact Ledger print output', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = execFileSync(ledgerBinary, [
    '--args-only', '--file', journalPath, 'print',
  ], { cwd: projectDirectory, encoding: 'utf8' });
  const ledlightOutput = execFileSync(process.execPath, [
    cliPath, 'transactions', '--file', journalPath,
  ], {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  });

  assert.equal(ledlightOutput, ledgerOutput);
});

test('print aliases transactions', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const commonOptions = {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  };
  const transactionsOutput = execFileSync(process.execPath, [
    cliPath, 'transactions', '--file', journalPath,
  ], commonOptions);
  const printOutput = execFileSync(process.execPath, [
    cliPath, 'print', '--file', journalPath,
  ], commonOptions);

  assert.equal(printOutput, transactionsOutput);
});

const scenarios = [
  {
    name: 'plain balances with implicit postings',
    fixture: 'basic',
    ledlightArguments: ['balance', '--format', 'csv'],
    ledgerArguments: { options: [], queries: [] },
  },
  {
    name: 'balances with unit and total lot costs',
    fixture: 'lot-cost',
    ledlightArguments: ['balance', '--format', 'csv'],
    ledgerArguments: { options: [], queries: [] },
  },
  {
    name: 'unrealized gains on open lots',
    fixture: 'lot-cost',
    ledlightArguments: ['gain', '--csv'],
    ledgerArguments: { options: ['--gain'], queries: [] },
  },
  {
    name: 'inverted account-prefix selection',
    fixture: 'basic',
    ledlightArguments: ['balance', '--accounts', 'Expenses:', '--invert', '--format', 'csv'],
    ledgerArguments: { options: ['--invert'], queries: ['^Expenses:'] },
  },
  {
    name: 'included files, an inclusive interval, and multiple account prefixes',
    fixture: 'includes',
    ledlightArguments: [
      'balance',
      '--from', '2024-01-01',
      '--to', '2024-01-31',
      '--accounts', 'Assets:',
      '--accounts', 'Expenses:',
      '--format', 'csv',
    ],
    ledgerArguments: {
      options: ['--begin', '2024-01-01', '--end', '2024-02-01'],
      queries: ['^Assets:', '^Expenses:'],
    },
  },
  {
    name: 'latest-price valuation in the journal default commodity',
    fixture: 'valuation',
    ledlightArguments: ['balance', '--accounts', 'Assets:Investments', '--value', '--format', 'csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:Investments'],
    },
  },
  {
    name: 'older resolvable prices when newer indirect quotes are unusable',
    fixture: 'valuation-selection',
    ledlightArguments: ['balance', '--accounts', 'Assets:', '--value', '--format', 'csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:'],
    },
  },
];

test('the configured Ledger CLI is available', () => {
  assert.match(execFileSync(ledgerBinary, ['--version'], { encoding: 'utf8' }), /^Ledger 3\./u);
});

test('accounts defaults to the exact Ledger accounts output', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = execFileSync(ledgerBinary, [
    '--args-only', '--file', journalPath, 'accounts',
  ], { cwd: projectDirectory, encoding: 'utf8' });
  const ledlightOutput = execFileSync(process.execPath, [
    cliPath, 'accounts', '--file', journalPath,
  ], {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  });

  assert.equal(ledlightOutput, ledgerOutput);
});

test('raw listings and print match Ledger for used declarations and market prices', (t) => {
  const projectDirectory = temporaryJournal(t, `commodity USD
  default
  format 1,000.00 USD
commodity FUND
  format 1000.000 FUND
commodity UNUSED
tag Used
tag Unused
account Assets Fund
account Assets:Fund
account Assets:Unused
account Equity:Opening
P 2024-01-01 FUND 9 USD
P 2024-01-01 FUND 10 USD

2024-01-02 Buy
  ; Used: yes
  Assets:Fund  2 FUND {{20 USD}}
  Assets Fund  -20 USD

2024-01-03 No change
  Assets:Fund  0 FUND
  Equity:Opening  0 FUND
`);
  const journalPath = path.join(projectDirectory, 'journal.ledger');

  for (const [ledlightCommand, ledgerCommandName] of [
    ['accounts', 'accounts'],
    ['tags', 'tags'],
    ['commodities', 'commodities'],
    ['prices', 'prices'],
    ['transactions', 'print'],
  ]) {
    const ledgerOutput = exactCommandOutput(projectDirectory, ledgerBinary, [
      '--args-only', '--no-pager', '--file', journalPath, ledgerCommandName,
    ]);
    const ledlightOutput = exactCommandOutput(projectDirectory, process.execPath, [
      cliPath, ledlightCommand, '--file', journalPath,
    ]);
    assert.equal(ledlightOutput, ledgerOutput, `${ledlightCommand} output differs`);
  }
});

test('transactions does not apply the API page limit to default text output', (t) => {
  const transactions = Array.from({ length: 101 }, (_, index) => `
2024-01-01 Entry ${index + 1}
  Assets:Cash  1 USD
  Equity:Opening  -1 USD
`).join('');
  const projectDirectory = temporaryJournal(t, `commodity USD
  default
  format 1,000.00 USD
account Assets:Cash
account Equity:Opening
${transactions}`);
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = exactCommandOutput(projectDirectory, ledgerBinary, [
    '--args-only', '--no-pager', '--file', journalPath, 'print',
  ]);
  const ledlightOutput = exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'transactions', '--file', journalPath,
  ]);

  assert.equal(ledlightOutput, ledgerOutput);
});

test('accounts accepts multiple filters and --ledger preserves their Ledger syntax', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const commonOptions = {
    cwd: projectDirectory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
  };
  const arguments_ = [
    'accounts', '--file', journalPath,
    '--accounts', '^Assets:', '--accounts', '^Expenses:',
  ];
  const expectedOutput = execFileSync(ledgerBinary, [
    '--args-only', '--no-pager', '--file', journalPath,
    'accounts', '^Assets:', '^Expenses:',
  ], commonOptions);
  const ledlightOutput = execFileSync(process.execPath, [cliPath, ...arguments_], commonOptions);
  const ledgerCommand = execFileSync(process.execPath, [
    cliPath, ...arguments_, '--ledger',
  ], commonOptions).trimEnd();

  assert.equal(ledlightOutput, expectedOutput);
  assert.equal(execSync(ledgerCommand, commonOptions), expectedOutput);
});

for (const command of ['accounts', 'print']) {
  test(`${command} --ledger prints a standalone command with identical output`, (t) => {
    const projectDirectory = temporaryProject(t, 'basic');
    const journalPath = path.join(projectDirectory, 'journal.ledger');
    fs.writeFileSync(path.join(projectDirectory, '.ledgerrc'), '--file missing.ledger\n');
    const commonOptions = {
      cwd: projectDirectory,
      encoding: 'utf8',
      env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(projectDirectory, '.cache') },
    };
    const ledlightCommand = command === 'print' ? 'print' : 'accounts';
    const expectedOutput = execFileSync(process.execPath, [
      cliPath, ledlightCommand, '--file', journalPath,
    ], commonOptions);
    const ledgerCommand = execFileSync(process.execPath, [
      cliPath, ledlightCommand, '--file', journalPath, '--ledger',
    ], commonOptions).trimEnd();

    assert.match(
      ledgerCommand,
      new RegExp(`^ledger --args-only --no-pager --file .+ ${command}$`, 'u'),
    );
    assert.equal(execSync(ledgerCommand, commonOptions), expectedOutput);
  });
}

for (const scenario of scenarios) {
  test(`Ledlight and Ledger produce the same ${scenario.name}`, (t) => {
    const projectDirectory = temporaryProject(t, scenario.fixture);
    assert.deepEqual(
      runLedlight(projectDirectory, scenario.ledlightArguments),
      runLedger(projectDirectory, scenario.ledgerArguments),
    );
  });
}
