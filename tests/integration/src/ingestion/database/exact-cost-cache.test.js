'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { ensureDatabaseCurrent, $$private: { buildDatabase } } =
  resolveRepositoryModule('src/ingestion/database/database.js');

function fixture(t, options) {
  const { secondDate, totalCosts } = { secondDate: '2024-01-02', totalCosts: false, ...options };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-exact-cost-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
commodity FUND
  format 1,000.000 FUND
account Assets:Fund
account Assets:Cash

2024-01-01 First purchase
  Assets:Fund  3 FUND ${totalCosts ? '{{100 SEK}}' : '{33.33 SEK}'}
  Assets:Cash  -100 SEK

${secondDate} Second purchase
  Assets:Fund  3 FUND ${totalCosts ? '{{200 SEK}}' : '{66.67 SEK}'}
  Assets:Cash  -200 SEK
`);
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, journalPath).warnings };
}

test('rebuilds cached diagnostics that previously tolerated cancelling cost residuals', (t) => {
  const { journalPath, databasePath, warnings } = fixture(t, {});
  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '24' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  const result = ensureDatabaseCurrent(databasePath, journalPath);
  assert.equal(result.rebuilt, true);
  assert.deepEqual(result.summary.warnings, warnings);
  assert.equal(ensureDatabaseCurrent(databasePath, journalPath).rebuilt, false);
});
