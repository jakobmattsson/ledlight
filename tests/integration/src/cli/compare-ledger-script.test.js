'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseCase } = require('../../../support/case');

const root = path.resolve(__dirname, '../../../..');
const script = path.join(root, 'scripts/ledger-compatibility/compare-ledger.js');
const fixture = path.join(root, 'tests/api/queries/compatibility/ledger/ledger-basic-accounts.case');
const ledgerBinary = process.env.LEDGER_BIN ?? 'ledger';

function withJournal(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-compare-script-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journal = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journal, source);
  return { directory, journal };
}

function runComparison(directory, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, LEDLIGHT_CACHE_HOME: path.join(directory, 'cache') },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test('comparison command help explains its parameters and shows examples', () => {
  const result = runComparison(root, ['--help']);
  assert.match(result.stdout, /--case <name>\s+compare one named matrix case/u);
  assert.match(result.stdout, /default: all; see --list/u);
  assert.match(result.stdout, /Examples:\n {2}ledlight-cmp --list\n {2}ledlight-cmp --file main\.ledger/u);
});

test('comparison matrix applies ISO dates to every Ledger command', (t) => {
  const { directory, journal } = withJournal(t, parseCase(fixture).file);
  const matrix = runComparison(directory, ['--list']);
  assert.equal(matrix.stderr, '');
  const ledgerCommands = matrix.stdout.split('\n').filter((line) => line.includes('`ledger '));
  assert.equal(ledgerCommands.length, 8);
  for (const command of ledgerCommands) assert.match(command, /--date-format %Y-%m-%d/u);
  const result = runComparison(directory, ['--file', journal, '--ledger-bin', ledgerBinary]);
  assert.equal(result.stdout, 'PASS accounts\nPASS tags\nPASS commodities\nPASS prices\nPASS transactions\n' +
    'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
  assert.equal(result.stderr, '');
});

test('comparison script checks balances with market gains and a nonzero total', (t) => {
  const { directory, journal } = withJournal(t, `commodity SEK
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
  const result = runComparison(directory, [
    '--file', journal,
    '--case', 'balance', '--case', 'balance-with-total', '--case', 'balance-inverted',
    '--ledger-bin', ledgerBinary,
  ]);
  assert.equal(result.stdout, 'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
  for (const name of ['balance', 'balance-with-total', 'balance-inverted']) {
    assert.match(result.stderr, new RegExp(`\\[${name}: ledlight\\]\\n\\[INVALID_COMMODITY_TRADE\\]`, 'u'));
  }
  assert.equal((result.stderr.match(/\[INVALID_COMMODITY_TRADE\]/gu) ?? []).length, 3);
});
