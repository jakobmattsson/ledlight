'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cliPath = path.resolve(__dirname, '../../../../src/cli/run.js');
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

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-input-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const temporaryDirectory = path.join(directory, 'tmp');
  fs.mkdirSync(temporaryDirectory);
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, source);
  const cacheDirectory = path.join(directory, 'cache');
  function run(arguments_, input) {
    const result = spawnSync(process.execPath, [cliPath, ...arguments_], {
      cwd: directory,
      input: input ?? source,
      encoding: 'utf8',
      env: {
        ...process.env, HOME: directory, TMPDIR: temporaryDirectory,
        LEDLIGHT_CACHE_HOME: cacheDirectory,
      },
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.deepEqual(fs.readdirSync(temporaryDirectory), [], 'stdin storage must be removed');
    return result;
  }
  return { directory, journalPath, cacheDirectory, run };
}

test('path-bearing reports identify stdin instead of the file path', (t) => {
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

test('stdin overrides configuration, explicit paths override stdin, and empty input falls back to configuration', (t) => {
  const { run, directory, journalPath, cacheDirectory } = fixture(t);
  const configurationPath = path.join(directory, '.ledlightrc');
  fs.writeFileSync(configurationPath, '--unknown invalid\n');
  const piped = run(['aggregate', '--value', '--include-total', '--format', 'json']);
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
