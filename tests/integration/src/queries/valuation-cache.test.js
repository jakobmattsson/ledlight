'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery, resolveRepositoryModule } = require('../../../support/repository-container');

const { buildDatabase } = resolveRepositoryModule('src/impl/ingestion/database/database.js').$$private;
const { readDatabase } = resolveRepositoryModule('src/impl/ingestion/database/database-reader.js');
const { execute } = resolveQuery('aggregate');

test('aggregate uses materialized valuation rates without filling the raw price cache', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-valuation-cache-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
commodity FUND
  format 1,000 FUND
account Assets:Fund
account Equity:Opening
P 2024-01-01 FUND 10 SEK

2024-01-01 Opening
  Assets:Fund  2 FUND {10 SEK}
  Equity:Opening  -20 SEK
`);
  buildDatabase(databasePath, journalPath);
  const valuationPriceCache = new Map();
  const rows = readDatabase(databasePath, (database) => execute(database, {
    to: '2024-01-01', accounts: ['Assets:Fund'], denominate: true,
  }, { valuationPriceCache }));

  assert.deepEqual(rows, [{ account: 'Assets:Fund', commodity: 'SEK', quantity: '20' }]);
  assert.equal(valuationPriceCache.size, 0);
});
