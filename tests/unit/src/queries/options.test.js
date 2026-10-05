'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { asValue } = require('awilix');
const { createRepositoryContainer } = require('../../../../src/composition/repository-container');

function createJournal(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-query-options-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
account Assets:Cash
account Equity:Opening
2024-02-28 Opening
  Assets:Cash  10 SEK
  Equity:Opening
2024-02-29 Leap day
  Assets:Cash  2 SEK
  Equity:Opening
2024-03-01 Following day
  Assets:Cash  3 SEK
  Equity:Opening
`);
  const container = createRepositoryContainer();
  // Keep query fixtures and their caches independent of the configured instance.
  container.register('processEnvironment', asValue({ LEDLIGHT_CACHE_HOME: path.join(directory, 'cache') }));
  return { journal: container.resolve('project').openJournal(journalPath), queries: container.resolve('queries') };
}

function invalidInput(operation, message) {
  assert.throws(operation, (error) => {
    assert.equal(error.code, 'LEDLIGHT_INVALID_API_INPUT');
    if (message) assert.match(error.message, message);
    return true;
  });
}

test('every public query rejects unknown options and invalid option objects', (t) => {
  const { journal, queries } = createJournal(t);
  for (const { name } of queries) {
    invalidInput(() => journal[name]({ unknown: true }), /Unknown .* option: unknown/u);
    for (const value of [null, [], 'options', true, 1]) {
      invalidInput(() => journal[name](value), /options must be an object/u);
    }
  }
  assert.deepEqual(journal.prices({}), journal.prices());
  invalidInput(() => journal.prices({ from: '2024-02-29' }), /Unknown prices option: from/u);
});

test('date parameters share calendar validation and inclusive interval ordering', (t) => {
  const { journal, queries } = createJournal(t);
  for (const { name, inputSchema } of queries) {
    for (const field of ['from', 'to'].filter((key) => key in inputSchema.shape)) {
      for (const value of ['2023-02-29', '2024-02-30', '2024-2-01', '2024/02/01',
        '2024-02-29T00:00:00Z', '', null, new Date('2024-02-29')]) {
        invalidInput(() => journal[name]({ [field]: value }), /must be a valid date in YYYY-MM-DD format/u);
      }
      assert.doesNotThrow(() => journal[name]({ [field]: '2024-02-29' }));
    }
    if ('from' in inputSchema.shape && 'to' in inputSchema.shape) {
      invalidInput(() => journal[name]({ from: '2024-03-01', to: '2024-02-29' }),
        /from date .* is after to date/u);
      assert.doesNotThrow(() => journal[name]({ from: '2024-02-29', to: '2024-02-29' }));
    }
  }
});

test('shared selections and booleans have consistent validation and duplicate handling', (t) => {
  const { journal, queries } = createJournal(t);
  for (const { name, inputSchema } of queries) {
    if ('accounts' in inputSchema.shape) {
      for (const accounts of ['Assets:', [1], [''], null]) {
        invalidInput(() => journal[name]({ accounts }));
      }
      assert.deepEqual(journal[name]({ accounts: ['Assets:', 'Assets:'] }),
        journal[name]({ accounts: ['Assets:'] }), name);
    }
    for (const field of ['invert', 'inValuationCommodity', 'withValuationValue', 'includeTotal']
      .filter((key) => key in inputSchema.shape)) {
      invalidInput(() => journal[name]({ accounts: ['Assets:'], [field]: 'false' }),
        /must be a boolean/u);
    }
  }
});

test('range queries include both endpoints while histories retain opening balances', (t) => {
  const { journal } = createJournal(t);
  const options = { accounts: ['Assets:'], from: '2024-02-29', to: '2024-02-29' };
  assert.deepEqual(journal.aggregate(options), [
    { account: 'Assets:Cash', quantity: '2', commodity: 'SEK' },
  ]);
  assert.deepEqual(journal.postings(options).map(({ postingDate, amounts }) => ({ postingDate, amounts })), [
    { postingDate: '2024-02-29', amounts: [{ quantity: '2', commodity: 'SEK', balance: '12' }] },
  ]);
  assert.deepEqual(journal.balanceHistoryReport(options), [
    { date: '2024-02-29', amount: '12', commodity: 'SEK' },
  ]);
  const performance = journal.investmentPerformance(options);
  assert.equal(performance.openingValue, 10);
  assert.equal(performance.endingValue, 12);
  assert.equal(performance.netContributions, 2);
  assert.deepEqual(performance.points.map(({ date }) => date), ['2024-02-29']);
});
