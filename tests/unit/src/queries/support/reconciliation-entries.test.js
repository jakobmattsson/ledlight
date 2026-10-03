'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadReconciliationEntries } = resolveRepositoryModule(
  "src/queries/support/reconciliation-entries.js",
).$$private;
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

test('reads direct and related reconciliation entries from one current database', (t) => {
  const journalPath = createProject(t);
  const first = loadReconciliationEntries(journalPath);

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

  const second = loadReconciliationEntries(journalPath);
  assert.equal(second.rebuilt, false);
});
