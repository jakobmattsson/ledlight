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

function history(databasePath) {
  return readDatabase(databasePath, (database) => resolveQuery('balanceHistoryReport').execute(
    database, { valuation: 'cost', dateBasis: 'transaction' }, {},
  ));
}

for (const secondDate of ['2024-01-01', '2024-01-02']) {
  test(`warns per transaction even when cost residuals cancel on ${secondDate}`, (t) => {
    const { databasePath, warnings } = fixture(t, { secondDate });
    assert.deepEqual(warnings.map(({ code, message, line }) => ({ code, message, line })), [
      { code: 'UNBALANCED_TRANSACTION', message: 'Transaction does not balance: -0.01 SEK', line: 9 },
      { code: 'UNBALANCED_TRANSACTION', message: 'Transaction does not balance: 0.01 SEK', line: 13 },
    ]);
    assert.deepEqual(history(databasePath), secondDate === '2024-01-01' ? [
      { date: '2024-01-01', amount: '0', commodity: 'SEK' },
    ] : [
      { date: '2024-01-01', amount: '-0.01', commodity: 'SEK' },
      { date: '2024-01-02', amount: '0', commodity: 'SEK' },
    ]);
  });
}

test('recording exact total costs keeps every transaction date at zero without warnings', (t) => {
  const { databasePath, warnings } = fixture(t, { totalCosts: true });
  assert.deepEqual(warnings, []);
  assert.deepEqual(history(databasePath), [
    { date: '2024-01-01', amount: '0', commodity: 'SEK' },
    { date: '2024-01-02', amount: '0', commodity: 'SEK' },
  ]);
});

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
