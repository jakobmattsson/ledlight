'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const priceScenarios = require('../../../support/price-scenarios');

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
    '--args-only', '--date-format', '%Y-%m-%d',
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

test('transactions matches the exact Ledger print output', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = execFileSync(ledgerBinary, [
    '--args-only', '--date-format', '%Y-%m-%d', '--file', journalPath, 'print',
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

test('transactions matches Ledger print formatting across included files', (t) => {
  const projectDirectory = temporaryProject(t, 'print-formatting');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = exactCommandOutput(projectDirectory, ledgerBinary, [
    '--args-only', '--date-format', '%Y-%m-%d', '--no-pager', '--file', journalPath, 'print',
  ]);
  const ledlightOutput = exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'transactions', '--file', journalPath,
  ]);

  assert.equal(ledlightOutput, ledgerOutput);
});


const scenarios = [
  {
    name: 'plain posting summaries with implicit postings',
    fixture: 'basic',
    ledlightArguments: ['aggregate', '--format', 'csv'],
    ledgerArguments: { options: [], queries: [] },
  },
  {
    name: 'posting summaries with unit and total lot costs',
    fixture: 'lot-cost',
    ledlightArguments: ['aggregate', '--format', 'csv'],
    ledgerArguments: { options: [], queries: [] },
  },
  {
    name: 'unrealized gains on open lots',
    fixture: 'lot-cost',
    ledlightArguments: ['unrealized-gains', '--format', 'csv'],
    ledgerArguments: { options: ['--gain'], queries: [] },
  },
  {
    name: 'inverted account-prefix selection',
    fixture: 'basic',
    ledlightArguments: ['aggregate', '--accounts', 'Expenses:', '--invert', '--format', 'csv'],
    ledgerArguments: { options: ['--invert'], queries: ['^Expenses:'] },
  },
  {
    name: 'included files, an inclusive interval, and multiple account prefixes',
    fixture: 'includes',
    ledlightArguments: [
      'aggregate',
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
    ledlightArguments: ['aggregate', '--accounts', 'Assets:Investments', '--value', '--format', 'csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:Investments'],
    },
  },
  {
    name: 'older resolvable prices when newer indirect quotes are unusable',
    fixture: 'valuation-selection',
    ledlightArguments: ['aggregate', '--accounts', 'Assets:', '--value', '--format', 'csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:'],
    },
  },
];

test('the configured Ledger CLI is available', () => {
  assert.match(execFileSync(ledgerBinary, ['--version'], { encoding: 'utf8' }), /^Ledger 3\./u);
});

test('unconverted totals match Ledger per commodity in every output format', (t) => {
  const directory = temporaryJournal(t, `2024-01-01 Opening
  Assets:A  0.1 FUND
  Assets:A  10 USD
  Equity:Opening  -0.1 FUND
  Equity:Opening  -10 USD

2024-01-02 Additional holding
  Assets:B  0.2 FUND
  Assets:B  -2 USD
  Equity:Opening  -0.2 FUND
  Equity:Opening  2 USD
`);
  const journalPath = path.join(directory, 'journal.ledger');
  const ledgerOutput = exactCommandOutput(directory, ledgerBinary, [
    '--args-only', '--no-pager', '--file', journalPath, 'balance', '--flat', '^Assets:',
  ]);
  const ledgerTotals = ledgerOutput.split(/^-+\n/mu)[1].trim().split('\n').map((line) => {
    const [quantity, commodity] = line.trim().split(/\s+/u);
    return { account: 'Total', quantity: normalizeDecimal(quantity), commodity, isTotal: true };
  });
  const arguments_ = [cliPath, 'aggregate', '--file', journalPath, '--accounts', '^Assets:', '--include-total'];
  const json = JSON.parse(exactCommandOutput(directory, process.execPath, [...arguments_, '--format', 'json']));
  assert.deepEqual(json.filter((row) => row.isTotal), ledgerTotals);
  const csv = exactCommandOutput(directory, process.execPath, [...arguments_, '--format', 'csv']);
  assert.equal(csv.split('\n').filter((line) => line.startsWith('Total,')).join('\n'),
    ledgerTotals.map((row) => `Total,${row.quantity},${row.commodity}`).join('\n'));
  const text = exactCommandOutput(directory, process.execPath, arguments_);
  assert.equal(text.match(/^-+$/gmu).length, 1);
  assert.deepEqual(text.split(/^-+\n/mu)[1].trim().split('\n').map((line) => {
    const [quantity, commodity] = line.trim().split(/\s+/u);
    return { account: 'Total', quantity: normalizeDecimal(quantity), commodity, isTotal: true };
  }), ledgerTotals);
});

test('accounts defaults to the exact Ledger accounts output', (t) => {
  const projectDirectory = temporaryProject(t, 'basic');
  const journalPath = path.join(projectDirectory, 'journal.ledger');
  const ledgerOutput = execFileSync(ledgerBinary, [
    '--args-only', '--date-format', '%Y-%m-%d', '--file', journalPath, 'accounts',
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
  format 1000 UNUSED
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
      '--args-only', '--date-format', '%Y-%m-%d', '--no-pager', '--file', journalPath, ledgerCommandName,
      ...(ledgerCommandName === 'prices' ? ['--sort', 'date,account'] : []),
    ]);
    const ledlightOutput = exactCommandOutput(projectDirectory, process.execPath, [
      cliPath, ledlightCommand, '--file', journalPath,
    ]);
    assert.equal(ledlightOutput, ledgerOutput, `${ledlightCommand} output differs`);
  }

  assert.equal(exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'accounts', '--file', journalPath, '--usage', 'unused',
  ]), 'Assets:Unused\nEquity:Opening\n');
  assert.equal(exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'tags', '--file', journalPath, '--usage', 'unused',
  ]), 'Unused\n');
  assert.equal(exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'commodities', '--file', journalPath, '--usage', 'unused',
  ]), 'UNUSED\n');
});

for (const scenario of priceScenarios) {
  test(`prices matches Ledger: ${scenario.name}`, (t) => {
    const directory = temporaryJournal(t, scenario.source);
    for (const [name, source] of Object.entries(scenario.files ?? {})) {
      fs.writeFileSync(path.join(directory, name), source);
    }
    const journalPath = path.join(directory, 'journal.ledger');
    const ledgerOutput = exactCommandOutput(directory, ledgerBinary, [
      '--args-only', '--date-format', '%Y-%m-%d', '--no-pager', '--file', journalPath, 'prices', '--sort', 'date,account',
    ]);
    const ledlightOutput = exactCommandOutput(directory, process.execPath, [
      cliPath, 'prices', '--file', journalPath,
    ]);
    assert.equal(ledgerOutput, scenario.text);
    assert.equal(ledlightOutput, ledgerOutput);
    assert.equal(exactCommandOutput(directory, process.execPath, [
      path.join(repositoryRoot, 'scripts/compare-ledger.js'),
      '--file', journalPath, '--case', 'prices', '--ledger-bin', ledgerBinary,
    ]), 'PASS prices\n');

    const rows = scenario.expected.map(([date, baseCommodity, quoteQuantity, comment, quoteCommodity]) => ({
      date, baseCommodity, quoteQuantity, quoteCommodity: quoteCommodity ?? 'SEK', comment,
    }));
    assert.deepEqual(JSON.parse(exactCommandOutput(directory, process.execPath, [
      cliPath, 'prices', '--file', journalPath, '--format', 'json',
    ])), rows);
    const csv = exactCommandOutput(directory, process.execPath, [
      cliPath, 'prices', '--file', journalPath, '--format', 'csv',
    ]);
    assert.equal(csv, 'date,baseCommodity,quoteQuantity,quoteCommodity,comment\n' +
      rows.map((row) =>
        `${row.date},${row.baseCommodity},${row.quoteQuantity},${row.quoteCommodity},${row.comment ?? ''}\n`).join(''));
  });
}

test('the comparison matrix applies ISO dates to every Ledger command', (t) => {
  const directory = temporaryProject(t, 'basic');
  const comparisonPath = path.join(repositoryRoot, 'scripts/compare-ledger.js');
  const matrix = exactCommandOutput(directory, process.execPath, [comparisonPath, '--list']);
  const ledgerCommands = matrix.split('\n').filter((line) => line.includes('`ledger '));
  assert.equal(ledgerCommands.length, 8);
  for (const command of ledgerCommands) assert.match(command, /--date-format %Y-%m-%d/u);
  assert.equal(exactCommandOutput(directory, process.execPath, [
    comparisonPath, '--file', path.join(directory, 'journal.ledger'),
    '--ledger-bin', ledgerBinary,
  ]), 'PASS accounts\nPASS tags\nPASS commodities\nPASS prices\nPASS transactions\n' +
    'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
});

test('balance matrix cases match Ledger with market gains and a nonzero total', (t) => {
  const directory = temporaryJournal(t, `commodity SEK
  default
  format 1,000.00 SEK
commodity FUND
  format 1000 FUND
account Assets:Fund
account Equity:Opening

2024-01-01 Opening investment
  Assets:Fund  2 FUND @ 1000 SEK
  Equity:Opening  -2000 SEK

P 2024-01-02 FUND 1234.56 SEK
`);
  assert.equal(exactCommandOutput(directory, process.execPath, [
    path.join(repositoryRoot, 'scripts/compare-ledger.js'),
    '--file', path.join(directory, 'journal.ledger'),
    '--case', 'balance', '--case', 'balance-with-total', '--case', 'balance-inverted',
    '--ledger-bin', ledgerBinary,
  ]), 'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
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
    '--args-only', '--date-format', '%Y-%m-%d', '--no-pager', '--file', journalPath, 'print',
  ]);
  const ledlightOutput = exactCommandOutput(projectDirectory, process.execPath, [
    cliPath, 'transactions', '--file', journalPath,
  ]);

  assert.equal(ledlightOutput, ledgerOutput);
});

test('accounts accepts multiple filters matching Ledger query syntax', (t) => {
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
    '--args-only', '--date-format', '%Y-%m-%d', '--no-pager', '--file', journalPath,
    'accounts', '^Assets:', '^Expenses:',
  ], commonOptions);
  const ledlightOutput = execFileSync(process.execPath, [cliPath, ...arguments_], commonOptions);

  assert.equal(ledlightOutput, expectedOutput);
});

for (const scenario of scenarios) {
  test(`Ledlight and Ledger produce the same ${scenario.name}`, (t) => {
    const projectDirectory = temporaryProject(t, scenario.fixture);
    assert.deepEqual(
      runLedlight(projectDirectory, scenario.ledlightArguments),
      runLedger(projectDirectory, scenario.ledgerArguments),
    );
  });
}
