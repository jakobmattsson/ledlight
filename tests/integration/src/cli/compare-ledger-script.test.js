'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../../..');
const script = path.join(root, 'scripts/compare-ledger.js');
const fixture = path.join(root, 'tests/fixtures/ledger-compatibility/basic/journal.ledger');
const ledgerBinary = process.env.LEDGER_BIN ?? 'ledger';

function withJournal(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-compare-script-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journal = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journal, source);
  return { directory, journal };
}

test('comparison matrix applies ISO dates to every Ledger command', (t) => {
  const { directory, journal } = withJournal(t, fs.readFileSync(fixture, 'utf8'));
  const matrix = execFileSync(process.execPath, [script, '--list'], {
    cwd: directory, encoding: 'utf8',
  });
  const ledgerCommands = matrix.split('\n').filter((line) => line.includes('`ledger '));
  assert.equal(ledgerCommands.length, 8);
  for (const command of ledgerCommands) assert.match(command, /--date-format %Y-%m-%d/u);
  assert.equal(execFileSync(process.execPath, [
    script, '--file', journal, '--ledger-bin', ledgerBinary,
  ], { cwd: directory, encoding: 'utf8', env: {
    ...process.env, LEDLIGHT_CACHE_HOME: path.join(directory, 'cache'),
  } }), 'PASS accounts\nPASS tags\nPASS commodities\nPASS prices\nPASS transactions\n' +
    'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
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
  assert.equal(execFileSync(process.execPath, [
    script, '--file', journal,
    '--case', 'balance', '--case', 'balance-with-total', '--case', 'balance-inverted',
    '--ledger-bin', ledgerBinary,
  ], { cwd: directory, encoding: 'utf8', env: {
    ...process.env, LEDLIGHT_CACHE_HOME: path.join(directory, 'cache'),
  } }), 'PASS balance\nPASS balance-with-total\nPASS balance-inverted\n');
});
