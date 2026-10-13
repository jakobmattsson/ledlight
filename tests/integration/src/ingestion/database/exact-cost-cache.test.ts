'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { prepareDatabase, $$private: { buildDatabase } } =
  resolveRepositoryModule('src/modules/implementations/database/database.js');

function fixture(t: TestContext, options: any) {
  const { secondDate, totalCosts }: any = { secondDate: '2024-01-02', totalCosts: false, ...options };
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
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, { kind: 'file', path: journalPath }).warnings };
}

test('rebuilds cached diagnostics that previously tolerated cancelling cost residuals', (t: TestContext) => {
  const { journalPath, databasePath, warnings } = fixture(t, {});
  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '24' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  prepareDatabase(databasePath, { kind: 'file', path: journalPath });
  const rebuilt = new Database(databasePath);
  try {
    assert.deepEqual(rebuilt.prepare(`
      SELECT code, message, source, line, column,
        start_line AS startLine, end_line AS endLine
      FROM ingestion_warnings ORDER BY position
    `).all(), warnings);
    rebuilt.prepare("INSERT INTO database_metadata (key, value) VALUES ('test_marker', 'retained')").run();
  } finally {
    rebuilt.close();
  }
  prepareDatabase(databasePath, { kind: 'file', path: journalPath });
  const reused = new Database(databasePath, { readonly: true });
  try {
    assert.equal(reused.prepare("SELECT value FROM database_metadata WHERE key = 'test_marker'").pluck().get(), 'retained');
  } finally {
    reused.close();
  }
});
