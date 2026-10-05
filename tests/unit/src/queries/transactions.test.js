'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule("src/core/project.js");
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-transactions-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-transactions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
account Assets:Cash
account Equity:Opening
account Expenses:Shop

2024-01-01 First
  Assets:Cash  10 SEK
  Equity:Opening  -10 SEK

2024-01-02 Second
  Assets:Cash  20 SEK
  Equity:Opening  -20 SEK

2024-01-03 Shop | Third  ; imported
  ; Project: Home
  Assets:Cash  -5 SEK  ; card
  Expenses:Shop
`);
  return openJournal(journalPath);
}

test('paginates complete transactions in either date order', (t) => {
  const project = createProject(t);

  const newest = project.transactions({ order: 'newest', page: 1, pageSize: 2 });
  assert.equal(newest.totalTransactions, 3);
  assert.equal(newest.totalPages, 2);
  assert.deepEqual(newest.transactions.map((transaction) => transaction.transactionDate), [
    '2024-01-03', '2024-01-02',
  ]);
  assert.equal(newest.transactions[0].description, 'Shop | Third');
  assert.equal('payee' in newest.transactions[0], false);
  assert.equal('narration' in newest.transactions[0], false);
  assert.equal(newest.transactions[0].comment, 'imported');
  assert.deepEqual(newest.transactions[0].notes, ['Project: Home']);
  assert.deepEqual(newest.transactions[0].postings[0], {
    postingDate: '2024-01-03',
    account: 'Assets:Cash',
    comment: 'card',
    amount: { quantity: '-5', commodity: 'SEK' },
    lotCost: null,
    cost: null,
    balanceAssignment: null,
    balanceAssertion: null,
    amounts: [{ quantity: '-5', commodity: 'SEK' }],
  });
  assert.equal(newest.transactions[0].postings[1].amount, null);

  const oldest = project.transactions({ order: 'oldest', page: 2, pageSize: 2 });
  assert.equal(oldest.page, 2);
  assert.deepEqual(oldest.transactions.map((transaction) => transaction.transactionDate), [
    '2024-01-03',
  ]);
});

test('defaults to the first 100 transactions in journal order', (t) => {
  const project = createProject(t);

  const result = project.transactions();

  assert.equal(result.order, 'oldest');
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
  assert.deepEqual(result.transactions.map((transaction) => transaction.transactionDate), [
    '2024-01-01', '2024-01-02', '2024-01-03',
  ]);
});

test('filters the transaction collection by ID', (t) => {
  const project = createProject(t);
  const id = project.transactions().transactions[2].transactionId;

  const result = project.transactions({ id });

  assert.equal(result.totalTransactions, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.transactions.map((transaction) => transaction.transactionId), [id]);
  assert.equal(result.transactions[0].description, 'Shop | Third');
  assert.equal(result.transactions[0].postings.length, 2);

  const missing = project.transactions({ id: 999 });
  assert.equal(missing.totalTransactions, 0);
  assert.equal(missing.totalPages, 0);
  assert.deepEqual(missing.transactions, []);
});

test('filters complete transactions with literal substrings and optional anchors', (t) => {
  const project = createProject(t);

  const result = project.transactions({ accounts: ['^Expenses:Shop$', '^Missing:'] });

  assert.equal(result.totalTransactions, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.transactions[0].description, 'Shop | Third');
  assert.deepEqual(
    result.transactions[0].postings.map((posting) => posting.account),
    ['Assets:Cash', 'Expenses:Shop'],
  );
  assert.equal(project.transactions({ accounts: ['Expenses'] }).totalTransactions, 1);
  assert.equal(project.transactions({ accounts: ['^Assets'] }).totalTransactions, 3);
  assert.equal(project.transactions({ accounts: ['Shop$'] }).totalTransactions, 1);
  assert.equal(project.transactions({ accounts: ['^Expenses$'] }).totalTransactions, 0);
});

test('clamps pages and rejects invalid list options', (t) => {
  const project = createProject(t);

  assert.equal(project.transactions({ order: 'newest', page: 99, pageSize: 2 }).page, 2);
  assert.throws(() => project.transactions({ order: 'sideways', page: 1, pageSize: 2 }),
    /order must be newest or oldest/u);
  assert.throws(() => project.transactions({ order: 'newest', page: 0, pageSize: 2 }),
    /page must be a positive integer/u);
  assert.equal(project.transactions({ order: 'newest', page: 1, pageSize: 101 }).pageSize, 101);
  assert.throws(() => project.transactions({ id: 'invalid' }),
    /id must be a positive integer/u);
  assert.throws(() => project.transactions({ accounts: [''] }),
    /accounts\.0 must be a non-empty string/u);
  assert.throws(() => project.transactions({
    order: 'newest', page: 1, pageSize: 2, unknown: true,
  }), /Unknown transactions option: unknown/u);
});
