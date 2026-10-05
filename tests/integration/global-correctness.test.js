'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');

const fixtures = path.resolve(__dirname, '../fixtures/global-correctness');
const cliPath = path.resolve(__dirname, '../../src/cli/run.js');

function commandArguments(command) {
  // Fixture commands use this small, explicit grammar; never execute a shell.
  assert.match(command, /^unrealized-gains --to \d{4}-\d{2}-\d{2} --format json(?: --accounts [\w:.-]+)*$/u);
  return command.split(' ');
}

function diagnosticLines(stderr) {
  return stderr.trimEnd().split('\n').filter(Boolean)
    // Existing CLI source locations are indented and contain temporary paths.
    .filter((line) => !line.startsWith('  '));
}

for (const name of fs.readdirSync(fixtures).filter((name) =>
  fs.statSync(path.join(fixtures, name)).isDirectory()).sort()) {
  const expected = YAML.parse(fs.readFileSync(path.join(fixtures, name, 'expected.yaml'), 'utf8'));

  test(`global correctness CLI fixture: ${name}`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-global-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const journalPath = path.join(directory, 'journal.ledger');
    fs.copyFileSync(path.join(fixtures, name, 'journal.ledger'), journalPath);
    assert.ok(Array.isArray(expected.runs) && expected.runs.length > 0);

    for (const run of expected.runs) {
      await t.test(run.command, async (t) => {
        const { expect } = run;
        assert.ok([0, 1].includes(expect.exitCode));
        assert.ok(Array.isArray(expect.warnings));
        for (const warning of expect.warnings) assert.match(warning, /^\[[A-Z_]+\] /u);
        const result = spawnSync(process.execPath, [
          cliPath, ...commandArguments(run.command), '--file', journalPath,
        ], {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(directory, '.cache') },
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, expect.exitCode, result.stderr);
        const lines = diagnosticLines(result.stderr);
        const warnings = lines.filter((line) => line.startsWith('['));
        const errors = lines.filter((line) => !line.startsWith('['));

        if (expect.exitCode === 0) {
          assert.ok(Array.isArray(expect.result));
          assert.equal(expect.error, undefined);
          assert.deepEqual(JSON.parse(result.stdout), expect.result);
          assert.deepEqual(errors, []);
        } else {
          assert.equal(typeof expect.error, 'string');
          assert.equal(expect.result, undefined);
          assert.equal(result.stdout, '');
          assert.deepEqual(errors, [expect.error]);
        }

        // Only warning behavior is pending. Rows, failures, and exit codes always run.
        if (run.pendingWarnings) {
          assert.equal(typeof run.pendingWarnings, 'string');
          await t.test('expected warnings', { todo: run.pendingWarnings }, () => {
            assert.deepEqual(warnings, expect.warnings);
          });
        } else assert.deepEqual(warnings, expect.warnings);
      });
    }
  });
}
