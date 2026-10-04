#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const matrix = require('./ledger-compatibility-matrix');

const repositoryRoot = path.resolve(__dirname, '..');
const ledlightCli = path.join(repositoryRoot, 'src/cli/run.js');

function usage() {
  return `Usage: npm run compare:ledger -- --file <journal> [options]

Compare the verified Ledger and Ledlight command equivalents against any journal.

Options:
  --file <path>        root journal to compare
  --case <name>        run one matrix row (repeatable; defaults to every runnable row)
  --ledger-bin <path>  Ledger executable (defaults to LEDGER_BIN or ledger)
  --list               print the complete equivalence matrix without running it
  --help               show this help
`;
}

function readValue(arguments_, index, option) {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} expects a value`);
  }
  return value;
}

function parseArguments(arguments_) {
  const options = { cases: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help') options.help = true;
    else if (argument === '--list') options.list = true;
    else if (argument === '--file') {
      options.file = readValue(arguments_, index, argument);
      index += 1;
    } else if (argument === '--case') {
      options.cases.push(readValue(arguments_, index, argument));
      index += 1;
    } else if (argument === '--ledger-bin') {
      options.ledgerBin = readValue(arguments_, index, argument);
      index += 1;
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function markdownCell(value) {
  return value === null ? '—' : `\`${value.replaceAll('|', '\\|')}\``;
}

function printMatrix() {
  process.stdout.write('| Case | Ledlight | Ledger | Comparison |\n');
  process.stdout.write('| --- | --- | --- | --- |\n');
  for (const entry of matrix) {
    process.stdout.write(
      `| \`${entry.id}\` | ${markdownCell(entry.ledlight)} | ` +
      `${markdownCell(entry.ledger)} | ${entry.comparison} |\n`,
    );
  }
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
  if (!match) throw new Error(`Expected a plain decimal, received ${JSON.stringify(value)}`);
  const integer = match[2].replace(/^0+(?=\d)/u, '');
  const fraction = (match[3] ?? '').replace(/0+$/u, '');
  const unsigned = fraction ? `${integer}.${fraction}` : integer;
  return `${match[1] && unsigned !== '0' ? '-' : ''}${unsigned}`;
}

function normalizedRows(rows) {
  return rows.map(([account, amount, commodity]) => ({
    account,
    amount: normalizeDecimal(amount),
    commodity,
  })).sort((left, right) =>
    left.account.localeCompare(right.account, 'en') ||
    left.commodity.localeCompare(right.commodity, 'en'));
}

function comparableOutput(comparator, ledlightOutput, ledgerOutput) {
  if (comparator === 'exact') return { ledlight: ledlightOutput, ledger: ledgerOutput };
  const [, ...ledlightLines] = ledlightOutput.trimEnd().split('\n');
  const ledgerLines = ledgerOutput.trimEnd().split('\n').filter(Boolean);
  return {
    ledlight: normalizedRows(ledlightLines.filter(Boolean).map(parseCsvLine)),
    ledger: normalizedRows(ledgerLines.map((line) => line.split('\t'))),
  };
}

function run(executable, arguments_, options) {
  const result = spawnSync(executable, arguments_, {
    cwd: path.dirname(options.journal),
    encoding: 'utf8',
    env: options.environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit status ${result.status}`;
    throw new Error(detail);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function selectedCases(names) {
  const runnable = matrix.filter((entry) => entry.ledger !== null);
  if (names.length === 0) return runnable;
  return names.map((name) => {
    const entry = matrix.find((candidate) => candidate.id === name);
    if (!entry) throw new Error(`Unknown case ${JSON.stringify(name)}; use --list to see the matrix`);
    if (entry.ledger === null) throw new Error(`Case ${JSON.stringify(name)} has no verified Ledger equivalent`);
    return entry;
  });
}

function showMismatch(entry, comparable) {
  process.stdout.write(`FAIL ${entry.id}\n`);
  process.stdout.write(`  Ledger:   ${JSON.stringify(comparable.ledger, null, 2)}\n`);
  process.stdout.write(`  Ledlight: ${JSON.stringify(comparable.ledlight, null, 2)}\n`);
}

function main(arguments_) {
  const options = parseArguments(arguments_);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.list) {
    printMatrix();
    return;
  }
  if (!options.file) throw new Error('--file is required unless --list or --help is used');
  const journal = path.resolve(options.file);
  if (!fs.statSync(journal).isFile()) throw new Error(`Journal is not a file: ${journal}`);

  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-compare-'));
  const environment = { ...process.env, LEDLIGHT_CACHE_HOME: cacheDirectory };
  const ledgerBin = options.ledgerBin ?? process.env.LEDGER_BIN ?? 'ledger';
  let failures = 0;
  try {
    for (const entry of selectedCases(options.cases)) {
      try {
        const ledlight = run(process.execPath, [
          ledlightCli, ...entry.ledlightArguments, '--file', journal,
        ], { journal, environment });
        const ledger = run(ledgerBin, [
          '--args-only', '--no-pager', '--file', journal, ...entry.ledgerArguments,
        ], { journal, environment });
        const comparable = comparableOutput(entry.comparator, ledlight.stdout, ledger.stdout);
        if (JSON.stringify(comparable.ledlight) === JSON.stringify(comparable.ledger)) {
          process.stdout.write(`PASS ${entry.id}\n`);
        } else {
          failures += 1;
          showMismatch(entry, comparable);
        }
        if (ledlight.stderr) process.stderr.write(`[${entry.id}: ledlight]\n${ledlight.stderr}`);
        if (ledger.stderr) process.stderr.write(`[${entry.id}: ledger]\n${ledger.stderr}`);
      } catch (error) {
        failures += 1;
        process.stdout.write(`ERROR ${entry.id}: ${error.message}\n`);
      }
    }
  } finally {
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  }
  if (failures > 0) process.exitCode = 1;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}`);
  process.exitCode = 1;
}
