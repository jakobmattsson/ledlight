'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule("src/core/project.js");
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-account-details-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-account-details-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
account Assets:Closed
account Assets:Closed:Child
account Assets:Unused  ; Kept for future use
account Equity:Opening

2023-01-01 Open account
  Assets:Closed  10 SEK
  Equity:Opening  -10 SEK
  Assets:Closed  2 FUND {1 SEK}
  Equity:Opening  -2 SEK

2023-01-02 Close account
  Assets:Closed  -10 SEK
  Equity:Opening  10 SEK
  Assets:Closed  -2 FUND {1 SEK} @ 1 SEK
  Equity:Opening  2 SEK

2023-01-03 Child account activity
  Assets:Closed:Child  1 SEK
  Equity:Opening  -1 SEK

2023-01-02 Deferred posting
  Assets:Closed  1 SEK  ; [2023-01-04]
  Equity:Opening  -1 SEK  ; [2023-01-04]
`);
  return openJournal(journalPath);
}

test('groups matching account balances by commodity and retains zero balances', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.aggregate({
    accounts: ['Closed', '^Assets:Unused$'], groupBy: 'commodity',
  }), [
    { commodity: 'FUND', quantity: '0' },
    { commodity: 'SEK', quantity: '2' },
  ]);
  assert.deepEqual(project.aggregate({
    accounts: ['^Assets:Closed$'], groupBy: 'commodity', to: '2023-01-02',
  }), [
    { commodity: 'FUND', quantity: '0' },
    { commodity: 'SEK', quantity: '0' },
  ]);
});

test('lists declared accounts with usage and transaction counts in Ledger order', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.accounts(), [
    { account: 'Assets:Closed:Child', comment: null, used: true, transactionCount: 1 },
    { account: 'Assets:Closed', comment: null, used: true, transactionCount: 3 },
    {
      account: 'Assets:Unused', comment: 'Kept for future use', used: false, transactionCount: 0,
    },
    { account: 'Equity:Opening', comment: null, used: true, transactionCount: 4 },
  ]);
  assert.deepEqual(project.accounts({ accounts: ['Closed$', '^Equity:'] }), [
    { account: 'Assets:Closed', comment: null, used: true, transactionCount: 3 },
    { account: 'Equity:Opening', comment: null, used: true, transactionCount: 4 },
  ]);
});
