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

test('returns exact-account balances by commodity through an inclusive date', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.accountBalances({ account: 'Assets:Closed' }), [
    { commodity: 'FUND', quantity: '0' },
    { commodity: 'SEK', quantity: '1' },
  ]);
  assert.deepEqual(project.accountBalances({ account: 'Assets:Closed', to: '2023-01-02' }), [
    { commodity: 'FUND', quantity: '0' },
    { commodity: 'SEK', quantity: '0' },
  ]);
});

test('returns exact-account activity after either its transaction or posting date', (t) => {
  const project = createProject(t);

  assert.equal(project.accountPostings({ account: 'Assets:Closed' }).length, 5);
  assert.deepEqual(project.accountPostings({ account: 'Assets:Closed', after: '2023-01-02' }), [
    {
      transactionDate: '2023-01-02',
      postingDate: '2023-01-04',
      commodity: 'SEK',
      quantity: '1',
    },
  ]);
});

test('rejects invalid account-detail options', (t) => {
  const project = createProject(t);

  assert.throws(() => project.accountPostings({ account: '', after: '2023-01-02' }),
    /account must be a non-empty string/u);
  assert.throws(() => project.accountBalances({ account: 'Assets:Closed', to: '2023-02-30' }),
    /Invalid to date/u);
  assert.throws(() => project.accountBalances({ account: 'Assets:Closed', unknown: true }),
    /Unknown accountBalances option: unknown/u);
  assert.throws(() => project.accountTransactions({ account: 'Assets:Closed', unknown: true }),
    /Unknown accountTransactions option: unknown/u);
});

test('lists declared accounts with transaction counts', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.accounts(), [
    { account: 'Assets:Closed', comment: null, transactionCount: 3 },
    { account: 'Assets:Closed:Child', comment: null, transactionCount: 1 },
    { account: 'Assets:Unused', comment: 'Kept for future use', transactionCount: 0 },
    { account: 'Equity:Opening', comment: null, transactionCount: 4 },
  ]);
});

test('returns newest-first transactions and groups amounts by posting', (t) => {
  const project = createProject(t);

  const transactions = project.accountTransactions({ account: 'Assets:Closed' });
  assert.equal(transactions.length, 3);
  assert.deepEqual(transactions[0], {
    transactionId: 10,
    transactionDate: '2023-01-02',
    description: 'Deferred posting',
    postings: [{
      postingDate: '2023-01-04',
      amounts: [{ quantity: '1', commodity: 'SEK', balance: '1' }],
    }],
  });
  assert.deepEqual(transactions[2].postings, [{
    postingDate: '2023-01-01',
    amounts: [
      { quantity: '10', commodity: 'SEK', balance: '10' },
    ],
  }, {
    postingDate: '2023-01-01',
    amounts: [
      { quantity: '2', commodity: 'FUND', balance: '2' },
    ],
  }]);
});
