'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule('src/core/ledlight.js');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-reconciliation-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-reconciliation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
account Assets:Cash
account Expenses:Food

2024-01-01 Shop | Groceries
  Assets:Cash  -10 SEK
  Expenses:Food  10 SEK
`);
  return journalPath;
}

function reconciliationFields(entry) {
  const { filename, sourceLine, row, ...fields } = entry;
  assert.match(filename, /journal\.ledger$/u);
  assert.equal(sourceLine, 6);
  assert.ok(row > 0);
  return fields;
}

test('reads direct and related reconciliation entries from the open journal', (t) => {
  const journalPath = createProject(t);
  const journal = openJournal(journalPath);

  assert.deepEqual(journal.reconciliationEntries({
    accounts: ['Assets:Cash'],
  }).map(reconciliationFields), [{
    date: '2024-01-01',
    amount: '-10',
    description: 'Shop',
    commodity: 'SEK',
    account: 'Assets:Cash',
  }]);
  assert.deepEqual(
    journal.reconciliationEntries({
      accounts: ['Assets:Cash'], related: true,
    }).map(reconciliationFields),
    [{
      date: '2024-01-01',
      amount: '10',
      description: 'Shop',
      commodity: 'SEK',
      account: 'Assets:Cash',
      postingAccount: 'Expenses:Food',
    }],
  );
});

test('validates reconciliation options through the public API', (t) => {
  const journal = openJournal(createProject(t));

  assert.throws(() => journal.reconciliationEntries(),
    /accounts Invalid input: expected array/u);
  assert.throws(() => journal.reconciliationEntries({ accounts: [] }),
    /accounts must contain at least one account/u);
  assert.throws(() => journal.reconciliationEntries({ accounts: [''] }),
    /accounts\.0 must be a non-empty string/u);
  assert.throws(() => journal.reconciliationEntries({ accounts: ['Assets:Cash'], unknown: true }),
    /Unknown reconciliationEntries option: unknown/u);
});
