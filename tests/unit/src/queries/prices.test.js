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
      date, baseCommodity, quoteQuantity, comment,
    ]) => ({ date, baseCommodity, quoteQuantity, quoteCommodity: 'SEK', comment })));
  });
}
