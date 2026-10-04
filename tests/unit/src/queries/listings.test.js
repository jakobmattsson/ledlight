'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule('src/core/project.js');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-listings-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

function createProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-listings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
commodity FUND
commodity FUND ; duplicate
commodity UNUSED
tag Declared
tag Declared ; duplicate
account Assets:Fund ; primary
account Assets:Fund ; duplicate
account Equity:Opening
P 2024-01-02 FUND 12.5 SEK ; closing
P 2024-01-01 EUR 11 NOK
P 2024-01-02 FUND 13 SEK ; corrected

2024-01-03 Tagged ; :Reviewed:
  ; Source: import.csv
  Assets:Fund  1 FUND {10 SEK} ; Receipt: 42
  Equity:Opening  -10 SEK
`);
  return openJournal(journalPath);
}

test('lists each used tag once while omitting unused declarations', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.tags(), [
    { tag: 'Receipt' },
    { tag: 'Reviewed' },
    { tag: 'Source' },
  ]);
});

test('lists each used commodity once while omitting unused declarations', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.commodities(), [
    { commodity: 'FUND' },
    { commodity: 'SEK' },
  ]);
});

test('lists each used account once with its declaration metadata', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.accounts(), [{
    account: 'Assets:Fund', comment: 'primary', transactionCount: 1,
  }, {
    account: 'Equity:Opening', comment: null, transactionCount: 1,
  }]);
});

test('warns about every duplicate declaration', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.warnings
    .filter(({ code }) => code.startsWith('DUPLICATE_'))
    .map(({ code, message }) => ({ code, message })), [{
    code: 'DUPLICATE_COMMODITY_DECLARATION',
    message: 'Commodity FUND has already been declared',
  }, {
    code: 'DUPLICATE_TAG_DECLARATION',
    message: 'Tag Declared has already been declared',
  }, {
    code: 'DUPLICATE_ACCOUNT_DECLARATION',
    message: 'Account Assets:Fund has already been declared',
  }]);
});

test('lists the effective explicit and inferred market prices', (t) => {
  const project = createProject(t);

  assert.deepEqual(project.prices(), [{
    date: '2024-01-02',
    baseCommodity: 'FUND',
    quoteQuantity: '13',
    quoteCommodity: 'SEK',
    comment: 'corrected',
  }, {
    date: '2024-01-03',
    baseCommodity: 'FUND',
    quoteQuantity: '10',
    quoteCommodity: 'SEK',
    comment: null,
  }]);
});
