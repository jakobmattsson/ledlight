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

test('diagnoses a non-nominal SEK cost without changing balancing or report values', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-self-commodity-cost-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
account Assets:Cash
account Equity:Opening

2024-01-01 Invalid price on reporting currency
  Assets:Cash  100 SEK {2 SEK}
  Equity:Opening  -200 SEK
`);
  const { warnings } = buildDatabase(databasePath, journalPath);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'INVALID_COMMODITY_TRADE');
  assert.match(warnings[0].message, /Lot cost.*must value one SEK at exactly one SEK/u);
  assert.equal(warnings[0].source, journalPath);
  assert.equal(warnings[0].line, 8);
  assert.deepEqual(readDatabase(databasePath, (database) =>
    resolveQuery('balanceHistoryReport').execute(database,
      { valuation: 'cost', dateBasis: 'transaction' }, {})), [
    { date: '2024-01-01', amount: '-100', commodity: 'SEK' },
  ]);

  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '25' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  const result = ensureDatabaseCurrent(databasePath, journalPath);
  assert.equal(result.rebuilt, true);
  assert.deepEqual(result.summary.warnings, warnings);
});
