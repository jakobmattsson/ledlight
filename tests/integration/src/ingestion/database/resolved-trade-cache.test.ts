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

function fixture(t: TestContext, transactions: any) {
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
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, { kind: 'file', path: journalPath }).warnings };
}

function tradeWarnings(warnings: any) {
  return warnings.filter(({ code }: any) => code === 'INVALID_COMMODITY_TRADE');
}

test('rebuilds cached diagnostics from before resolved trade validation', (t: TestContext) => {
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
  prepareDatabase(databasePath, { kind: 'file', path: journalPath });
  const rebuilt = new Database(databasePath, { readonly: true });
  try {
    assert.equal(tradeWarnings(rebuilt.prepare('SELECT code FROM ingestion_warnings').all()).length, 2);
  } finally {
    rebuilt.close();
  }
});
