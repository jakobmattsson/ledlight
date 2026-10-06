#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPatch } = require('diff');
const YAML = require('yaml');

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

const repositoryRoot = path.resolve(__dirname, '../..');
const ledlightCli = path.join(repositoryRoot, 'src/cli/run.js');
const matrixPath = path.join(__dirname, 'ledger-compatibility-matrix.yaml');

function loadMatrix() {
  const { baseline, commands } = YAML.parse(fs.readFileSync(matrixPath, 'utf8'));
  return Object.entries(commands).map(([id, command]) => [
    id,
    `ledlight ${command.ledlight} ${baseline.ledlight}`,
    `ledger ${baseline.ledger} ${command.ledger}`,
  ]);
}

function usage() {
  return `Usage: ledlight-cmp --file <journal> [options]

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
  process.stdout.write('| Case | Ledlight | Ledger |\n');
  process.stdout.write('| --- | --- | --- |\n');
  for (const [id, ledlightCommand, ledgerCommand] of loadMatrix()) {
    process.stdout.write(
      `| \`${id}\` | ${markdownCell(ledlightCommand)} | ` +
      `${markdownCell(ledgerCommand)} |\n`,
    );
  }
}

function run(command, options) {
  const [commandName, ...commandArguments] = command.split(' ');
  const executable = commandName === 'ledlight' ? process.execPath : options.ledgerBin;
  const prefixArguments = commandName === 'ledlight' ? [ledlightCli] : [];
  const arguments_ = [...prefixArguments, ...commandArguments]
    .map((argument) => argument === '<journal>' ? options.journal : argument);
  const result = spawnSync(executable, arguments_, {
    cwd: path.dirname(options.journal),
    encoding: 'utf8',
    env: options.environment,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit status ${result.status}`;
    throw new Error(detail);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function selectedCases(names) {
  const matrix = loadMatrix();
  if (names.length === 0) return matrix;
  return names.map((name) => {
    const entry = matrix.find(([id]) => id === name);
    if (!entry) throw new Error(`Unknown case ${JSON.stringify(name)}; use --list to see the matrix`);
    return entry;
  });
}

function showMismatch(id, ledlightOutput, ledgerOutput) {
  process.stdout.write(`FAIL ${id}\n`);
  process.stdout.write(createPatch(
    id,
    ledgerOutput,
    ledlightOutput,
    'Ledger',
    'Ledlight',
    { context: 3 },
  ));
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
    for (const [id, ledlightCommand, ledgerCommand] of selectedCases(options.cases)) {
      try {
        const commandOptions = { journal, environment, ledgerBin };
        const ledlight = run(ledlightCommand, commandOptions);
        const ledger = run(ledgerCommand, commandOptions);
        if (ledlight.stdout === ledger.stdout) {
          process.stdout.write(`PASS ${id}\n`);
        } else {
          failures += 1;
          showMismatch(id, ledlight.stdout, ledger.stdout);
        }
        if (ledlight.stderr) process.stderr.write(`[${id}: ledlight]\n${ledlight.stderr}`);
        if (ledger.stderr) process.stderr.write(`[${id}: ledger]\n${ledger.stderr}`);
      } catch (error) {
        failures += 1;
        process.stdout.write(`ERROR ${id}: ${error.message}\n`);
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
