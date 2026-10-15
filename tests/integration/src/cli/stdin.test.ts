'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createTestRepositoryContainer } = require('@jakobm/portico/testing');

const cliPath = path.resolve(__dirname, '../../../../src/run.js');
const source = `commodity SEK
  default
  format 1,000.00 SEK
commodity STOCK
  format 1,000 STOCK
account Assets:Stock
account Assets:Cash
P 2024-01-01 STOCK 12 SEK

2024-01-01 Purchase
  Assets:Stock  10 STOCK {10 SEK}
  Assets:Cash  -100 SEK
`;

function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-input-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const temporaryDirectory = path.join(directory, 'tmp');
  fs.mkdirSync(temporaryDirectory);
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, source);
  const cacheDirectory = path.join(directory, 'cache');
  const environment = { ...process.env, HOME: directory, LEDLIGHT_CACHE_HOME: cacheDirectory };
  let stdinSource = source;
  let stdout = '';
  let stderr = '';
  const container = createTestRepositoryContainer(path.resolve(__dirname, '../../../../src/modules'));
  container.overrideExternals({
    currentWorkingDirectory: (() => directory),
    os: ({ tmpdir: () => temporaryDirectory }),
    processEnvironment: (environment),
    standardInput: ({ isTTY: () => false, read: () => stdinSource }),
  });
  container.overrideInternal('cli', 'output', ({
    handleBrokenPipe() {},
    writeError(value: string) { stderr += value; },
    writeOutput(value: string) { stdout += value; },
  }));
  const executeCli = container.resolveInternal('cli', 'executeCli');

  function run(arguments_: string[], content?: string) {
    stdinSource = content ?? source;
    stdout = '';
    stderr = '';
    const status = executeCli.run(arguments_);
    assert.deepEqual(fs.readdirSync(temporaryDirectory), [], 'stdin storage must be removed');
    return { status, stdout, stderr };
  }

  function runProcess(arguments_: string[], input: string) {
    const result = spawnSync(process.execPath, [cliPath, ...arguments_], {
      cwd: directory,
      input,
      encoding: 'utf8',
      env: { ...environment, TMPDIR: temporaryDirectory },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.deepEqual(fs.readdirSync(temporaryDirectory), [], 'stdin storage must be removed');
    return result;
  }
  return { directory, journalPath, cacheDirectory, run, runProcess };
}

test('the CLI entrypoint reads piped stdin', (t: TestContext) => {
  const { runProcess } = fixture(t);
  const result = runProcess(['aggregate', '--denominate', '--include-total', '--format', 'json'], source);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).at(-1).quantity, '20');
});

test('stdin resolves included files from the working directory', (t: TestContext) => {
  const { directory, run } = fixture(t);
  fs.writeFileSync(path.join(directory, 'included.ledger'), source);
  const result = run(['aggregate', '--denominate', '--include-total', '--format', 'json'],
    'include included.ledger\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).at(-1).quantity, '20');
});

test('path-bearing reports identify stdin instead of the file path', (t: TestContext) => {
  const { run, journalPath } = fixture(t);
  for (const command of ['transactions', 'postings']) {
    const arguments_ = [command, '--format', 'json'];
    const fromFile = run([...arguments_, '--file', journalPath], '');
    assert.equal(fromFile.status, 0, fromFile.stderr);
    const expected = fromFile.stdout.replaceAll(fs.realpathSync.native(journalPath), '<stdin>');
    const result = run(arguments_);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, expected, command);
  }
});

test('stdin overrides configuration, explicit paths override stdin, and empty input falls back to configuration', (t: TestContext) => {
  const { run, directory, journalPath, cacheDirectory } = fixture(t);
  const configurationPath = path.join(directory, '.ledlightrc');
  fs.writeFileSync(configurationPath, '--unknown invalid\n');
  const piped = run(['aggregate', '--denominate', '--include-total', '--format', 'json']);
  assert.equal(piped.status, 0, piped.stderr);
  assert.equal(JSON.parse(piped.stdout).at(-1).quantity, '20');
  assert.equal(fs.existsSync(cacheDirectory), false, 'stdin must not populate the persistent cache');

  const explicit = run(['aggregate', '--file', journalPath, '--format', 'json'], 'invalid stdin');
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.stderr, '');
  fs.writeFileSync(configurationPath, `--file ${journalPath}\n`);
  const fallback = run(['aggregate', '--format', 'json'], '');
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.equal(fallback.stdout, explicit.stdout);

  const empty = run(['accounts', '--file=-', '--format', 'json'], '');
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout), []);
});
