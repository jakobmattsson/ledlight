'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const cliPath = path.join(repositoryRoot, 'src/ledlight/cli/run.js');
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/ledger-compatibility');
const ledgerBinary = process.env.LEDGER_BIN ?? 'ledger';

function temporaryProject(t, fixture) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-ledger-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(fixtureRoot, fixture), directory, { recursive: true });
  return directory;
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
  const output = execFileSync(process.execPath, [cliPath, ...arguments_], {
    cwd: projectDirectory,
    encoding: 'utf8',
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

const scenarios = [
  {
    name: 'plain balances with implicit postings',
    fixture: 'basic',
    ledlightArguments: ['aggregate', '--csv'],
    ledgerArguments: { options: [], queries: [] },
  },
  {
    name: 'inverted account-prefix selection',
    fixture: 'basic',
    ledlightArguments: ['aggregate', '--accounts', 'Expenses:', '--invert', '--csv'],
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
      '--csv',
    ],
    ledgerArguments: {
      options: ['--begin', '2024-01-01', '--end', '2024-02-01'],
      queries: ['^Assets:', '^Expenses:'],
    },
  },
  {
    name: 'latest-price valuation in the journal default commodity',
    fixture: 'valuation',
    ledlightArguments: ['aggregate', '--accounts', 'Assets:Investments', '--value', '--csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:Investments'],
    },
  },
  {
    name: 'older resolvable prices when newer indirect quotes are unusable',
    fixture: 'valuation-selection',
    ledlightArguments: ['aggregate', '--accounts', 'Assets:', '--value', '--csv'],
    ledgerArguments: {
      options: ['--exchange', 'USD'],
      queries: ['^Assets:'],
    },
  },
];

test('the configured Ledger CLI is available', () => {
  assert.match(execFileSync(ledgerBinary, ['--version'], { encoding: 'utf8' }), /^Ledger 3\./u);
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
