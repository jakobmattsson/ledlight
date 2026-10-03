'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openProject } = resolveRepositoryModule("src/core/ledlight.js");

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-transactions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(path.join(directory, 'journal.ledger'), `commodity SEK
  default
account Assets:Cash
account Equity:Opening

2024-01-01 First
  Assets:Cash  10 SEK
  Equity:Opening  -10 SEK

2024-01-02 Second
  Assets:Cash  20 SEK
  Equity:Opening  -20 SEK

2024-01-03 Shop | Third  ; imported
  Assets:Cash  -5 SEK  ; card
  Equity:Opening  5 SEK
`);
  return openProject(directory);
}

test('paginates complete transactions in either date order', (t) => {
  const project = createProject(t);

  const newest = project.ledgerTransactions({ order: 'newest', page: 1, pageSize: 2 });
  assert.equal(newest.totalTransactions, 3);
  assert.equal(newest.totalPages, 2);
  assert.deepEqual(newest.transactions.map((transaction) => transaction.transactionDate), [
    '2024-01-03', '2024-01-02',
  ]);
  assert.equal(newest.transactions[0].payee, 'Shop');
  assert.equal(newest.transactions[0].narration, 'Third');
  assert.equal(newest.transactions[0].comment, 'imported');
  assert.deepEqual(newest.transactions[0].postings[0], {
    postingDate: '2024-01-03',
    account: 'Assets:Cash',
    comment: 'card',
    amounts: [{ quantity: '-5', commodity: 'SEK' }],
  });

  const oldest = project.ledgerTransactions({ order: 'oldest', page: 2, pageSize: 2 });
  assert.equal(oldest.page, 2);
  assert.deepEqual(oldest.transactions.map((transaction) => transaction.transactionDate), [
    '2024-01-03',
  ]);
});

test('clamps pages and rejects invalid list options', (t) => {
  const project = createProject(t);

  assert.equal(project.ledgerTransactions({ order: 'newest', page: 99, pageSize: 2 }).page, 2);
  assert.throws(() => project.ledgerTransactions({ order: 'sideways', page: 1, pageSize: 2 }),
    /order must be newest or oldest/u);
  assert.throws(() => project.ledgerTransactions({ order: 'newest', page: 0, pageSize: 2 }),
    /page must be a positive integer/u);
  assert.throws(() => project.ledgerTransactions({ order: 'newest', page: 1, pageSize: 101 }),
    /pageSize must not exceed 100/u);
  assert.throws(() => project.ledgerTransactions({
    order: 'newest', page: 1, pageSize: 2, unknown: true,
  }), /Unknown ledgerTransactions option: unknown/u);
});
