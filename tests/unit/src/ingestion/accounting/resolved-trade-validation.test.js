'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule, resolveQuery } = require('../../../../support/repository-container');
const { ensureDatabaseCurrent, $$private: { buildDatabase } } =
  resolveRepositoryModule('src/ingestion/database/database.js');
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');
const { execute: aggregate } = resolveQuery('aggregate');

function fixture(t, transactions) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-resolved-trades-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
commodity FUND
  format 1,000 FUND
account Holdings
account Bank
account Opening
P 2024-01-01 FUND 100 USD
${transactions}`);
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, journalPath).warnings };
}

const purchase = `2024-01-01 Purchase
  Holdings  2 FUND {100 USD}
  Bank  -200 USD
`;

function tradeWarnings(warnings) {
  return warnings.filter(({ code }) => code === 'INVALID_COMMODITY_TRADE');
}

test('warns for both an assignment acquisition and its implicit commodity counterpart', (t) => {
  const { warnings, databasePath } = fixture(t, `2024-01-01 Opening balance
  Holdings  = 2 FUND
  Opening
`);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0].message, /Positive FUND posting/u);
  assert.match(warnings[1].message, /Negative FUND posting/u);
  assert.deepEqual(warnings.map(({ line }) => line), [11, 12]);
  const rows = readDatabase(databasePath, (database) => aggregate(database,
    { accounts: ['^Holdings$'], inValuationCommodity: true }, { valuationPriceCache: new Map() }));
  assert.deepEqual(rows, [{ account: 'Holdings', commodity: 'USD', quantity: '200' }]);
});

test('checks the resolved reduction rather than the positive assignment target', (t) => {
  const { warnings } = fixture(t, `${purchase}
2024-01-02 Reduce holdings
  Holdings  = 1 FUND
  Opening
`);
  const trades = tradeWarnings(warnings);
  assert.equal(trades.length, 2);
  assert.match(trades[0].message, /Negative FUND posting/u);
  assert.match(trades[1].message, /Positive FUND posting/u);
});

test('checks implicit commodity postings without duplicating explicit warnings', (t) => {
  const { warnings } = fixture(t, `2024-01-01 Transfer without basis
  Holdings  2 FUND
  Opening
`);
  assert.equal(tradeWarnings(warnings).length, 2);
  assert.deepEqual(tradeWarnings(warnings).map(({ line }) => line), [11, 12]);
});

test('checks every commodity in an implicit posting', (t) => {
  const { warnings } = fixture(t, `commodity OTHER
  format 1,000 OTHER
2024-01-01 Multiple commodities
  Holdings  2 FUND
  Holdings  3 OTHER
  Opening
`);
  const inferred = tradeWarnings(warnings).filter(({ line }) => line === 15);
  assert.equal(inferred.length, 2);
  assert.match(inferred[0].message, /Negative FUND/u);
  assert.match(inferred[1].message, /Negative OTHER/u);
});

for (const [name, source] of [
  ['implicit cash', '2024-01-01 Purchase\n  Holdings  2 FUND {100 USD}\n  Bank\n'],
  ['unchanged security balance', `${purchase}\n2024-01-02 Confirm balance\n  Holdings  = 2 FUND\n  Opening\n`],
  ['cash assignment', '2024-01-01 Opening cash\n  Bank  = 200 USD\n  Opening\n'],
  ['annotated transfer', `${purchase}\n2024-01-02 Transfer\n  Holdings  -2 FUND {100 USD}\n  Opening  2 FUND {100 USD}\n`],
]) {
  test(`keeps ${name} warning-free`, (t) => {
    assert.deepEqual(fixture(t, source).warnings, []);
  });
}

test('rebuilds cached diagnostics from before resolved trade validation', (t) => {
  const { journalPath, databasePath } = fixture(t, `2024-01-01 Opening balance
  Holdings  = 2 FUND
  Opening
`);
  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '23' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  const result = ensureDatabaseCurrent(databasePath, journalPath);
  assert.equal(result.rebuilt, true);
  assert.equal(tradeWarnings(result.summary.warnings).length, 2);
});
