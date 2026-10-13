'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { ensureDatabaseCurrent, $$private: { buildDatabase } } =
  resolveRepositoryModule('src/modules/implementations/database/internal/database.js');

function fixture(t: TestContext, sale: any, extra?: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-proceeds-'));
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
account Result
account Fees
account Other
P 2024-01-01 FUND 100 USD
2024-01-01 Purchase
  Holdings  10 FUND {100 USD}
  Bank  -1000 USD
2024-01-02 Sale
${sale}
${extra || ''}`);
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, journalPath).warnings };
}

test('rebuilds cached diagnostics from before sale proceeds validation', (t: TestContext) => {
  const { journalPath, databasePath } = fixture(t, `  Holdings  -1 FUND {100 USD} @ 999 USD
  Bank  120 USD
  Result  -20 USD`);
  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '22' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  const result = ensureDatabaseCurrent(databasePath, journalPath);
  assert.equal(result.rebuilt, true);
  assert.deepEqual(result.summary.warnings.map(({ code }: any) => code), ['SALE_PROCEEDS_MISMATCH']);
});
