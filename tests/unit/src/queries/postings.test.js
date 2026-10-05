'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule('src/core/project.js');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-postings-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-postings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
account Assets:Cash
account Assets:Fund
account Equity:Opening

2024-01-02 Buy fund  ; imported
  ; Project: Savings
  Assets:Cash  -100 SEK  ; [2024-01-03] card
  Assets:Fund  10 FUND {10 SEK} @ 100 SEK

2024-01-04 Opening balance
  Assets:Cash  20 SEK = 20 SEK
  Equity:Opening
`);
  return openJournal(journalPath);
}

test('returns every field for postings and their transactions in journal order', (t) => {
  const journal = createProject(t);

  const postings = journal.postings({
    from: '2024-01-02',
    to: '2024-01-03',
    accounts: ['^Assets:'],
  });

  assert.equal(postings.length, 2);
  assert.deepEqual(postings[0], {
    postingId: postings[0].postingId,
    transactionId: postings[0].transactionId,
    transactionDate: '2024-01-02',
    description: 'Buy fund',
    transactionComment: 'imported',
    transactionNotes: ['Project: Savings'],
    postingDate: '2024-01-03',
    account: 'Assets:Cash',
    postingComment: '[2024-01-03] card',
    amount: { quantity: '-100', commodity: 'SEK' },
    lotCost: null,
    cost: null,
    balanceAssignment: null,
    balanceAssertion: null,
    amounts: [{ quantity: '-100', commodity: 'SEK', balance: '-100' }],
  });
  assert.deepEqual(postings[1], {
    postingId: postings[1].postingId,
    transactionId: postings[1].transactionId,
    transactionDate: '2024-01-02',
    description: 'Buy fund',
    transactionComment: 'imported',
    transactionNotes: ['Project: Savings'],
    postingDate: '2024-01-02',
    account: 'Assets:Fund',
    postingComment: null,
    amount: { quantity: '10', commodity: 'FUND' },
    lotCost: { quantity: '10', commodity: 'SEK', isTotal: false },
    cost: { quantity: '100', commodity: 'SEK', isTotal: false },
    balanceAssignment: null,
    balanceAssertion: null,
    amounts: [{ quantity: '10', commodity: 'FUND', balance: '10' }],
  });
});

test('supports open-ended date and account filters', (t) => {
  const journal = createProject(t);

  assert.deepEqual(
    journal.postings({ from: '2024-01-04', accounts: ['Cash$'] })
      .map(({ postingDate, account }) => ({ postingDate, account })),
    [{ postingDate: '2024-01-04', account: 'Assets:Cash' }],
  );
  assert.equal(journal.postings({ to: '2024-01-01' }).length, 0);
});

test('validates posting query options', (t) => {
  const journal = createProject(t);

  assert.throws(() => journal.postings({ from: '2024-02-01', to: '2024-01-01' }),
    /from date 2024-02-01 is after to date 2024-01-01/u);
  assert.throws(() => journal.postings({ accounts: [''] }),
    /accounts\.0 must be a non-empty string/u);
  assert.throws(() => journal.postings({ unknown: true }),
    /Unknown postings option: unknown/u);
});
