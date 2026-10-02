'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadReconciliationEntries } = resolveRepositoryModule("src/ledlight/reports/reconciliation-entries.js");

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-reconciliation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(path.join(directory, 'journal.ledger'), `commodity SEK
account Assets:Cash
account Expenses:Food

2024-01-01 Shop | Groceries
  Assets:Cash  -10 SEK
  Expenses:Food  10 SEK
`);
  return directory;
}

function reconciliationFields(entry) {
  const { filename, sourceLine, row, ...fields } = entry;
  assert.match(filename, /journal\.ledger$/u);
  assert.equal(sourceLine, 5);
  assert.ok(row > 0);
  return fields;
}

test('reads direct and related reconciliation entries from one current database', (t) => {
  const directory = createProject(t);
  const first = loadReconciliationEntries(directory);

  assert.equal(first.rebuilt, true);
  assert.deepEqual(first.readEntries(['Assets:Cash']).map(reconciliationFields), [{
    date: '2024-01-01',
    amount: '-10',
    description: 'Shop',
    commodity: 'SEK',
    account: 'Assets:Cash',
  }]);
  assert.deepEqual(
    first.readEntries(['Assets:Cash'], { related: true }).map(reconciliationFields),
    [{
      date: '2024-01-01',
      amount: '10',
      description: 'Shop',
      commodity: 'SEK',
      account: 'Assets:Cash',
      postingAccount: 'Expenses:Food',
    }],
  );

  const second = loadReconciliationEntries(directory);
  assert.equal(second.rebuilt, false);
});
