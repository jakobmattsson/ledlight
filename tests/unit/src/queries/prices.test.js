'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');
const scenarios = require('../../../support/price-scenarios');
const { openJournal } = resolveRepositoryModule('src/core/project.js');

const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-prices-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

test('recurring unit prices from total acquisitions and sales round at thirty decimal places', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-prices-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
commodity FUND
  format 1000 FUND
account Assets
account Cash
account Gains

2024-01-01 Purchase
  Assets  3 FUND {{1 SEK}}
  Cash  -1 SEK

2024-01-02 Sale
  Assets  -3 FUND {{1 SEK}} @@ 2 SEK
  Cash  2 SEK
  Gains  -1 SEK
`);
  assert.deepEqual(openJournal(journalPath).prices().map((row) => row.quoteQuantity), [
    '0.333333333333333333333333333333',
    '0.666666666666666666666666666667',
  ]);
});

for (const scenario of scenarios) {
  test(`prices: ${scenario.name}`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-prices-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const journalPath = path.join(directory, 'journal.ledger');
    fs.writeFileSync(journalPath, scenario.source);
    for (const [name, source] of Object.entries(scenario.files ?? {})) {
      fs.writeFileSync(path.join(directory, name), source);
    }

    const journal = openJournal(journalPath);
    assert.deepEqual(journal.prices(), scenario.expected.map(([
      date, baseCommodity, quoteQuantity, comment, quoteCommodity,
    ]) => ({ date, baseCommodity, quoteQuantity, quoteCommodity: quoteCommodity ?? 'SEK', comment })));
  });
}
