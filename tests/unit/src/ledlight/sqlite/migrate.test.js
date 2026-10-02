'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { migrateDatabase } = resolveRepositoryModule("src/ledlight/sqlite/migrate.js");

function temporaryDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-migrate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = new Database(path.join(directory, 'journal.sqlite'));
  t.after(() => database.close());
  return database;
}

test('creates the current schema in an empty database', (t) => {
  const database = temporaryDatabase(t);
  migrateDatabase(database);

  const tables = database.prepare(`
    SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name
  `).pluck().all();
  assert.ok(tables.includes('database_metadata'));
  assert.ok(!tables.includes('metadata'));
  assert.ok(tables.includes('journal_entries'));
  assert.ok(tables.includes('transaction_tags'));
  assert.ok(tables.includes('posting_tags'));
  assert.ok(tables.includes('resolved_posting_amounts'));
  assert.ok(tables.includes('valuation_prices'));
  const reportDate = database.pragma('table_info(postings)')
    .find((column) => column.name === 'report_date');
  assert.equal(reportDate.notnull, 1);
  const postingColumns = database.pragma('table_info(postings)').map((column) => column.name);
  assert.ok(postingColumns.includes('lot_cost_quantity'));
  assert.ok(postingColumns.includes('lot_cost_commodity'));
  assert.ok(postingColumns.includes('lot_cost_is_total'));
  const transactionColumns = database.pragma('table_info(transactions)').map((column) => column.name);
  assert.ok(!transactionColumns.includes('status'));
  assert.ok(!transactionColumns.includes('code'));
  const priceColumns = database.pragma('table_info(prices)');
  assert.deepEqual(
    priceColumns.filter((column) => [
      'base_commodity', 'quote_quantity', 'quote_commodity',
    ].includes(column.name))
      .map(({ name, notnull }) => ({ name, notnull })),
    [
      { name: 'base_commodity', notnull: 1 },
      { name: 'quote_quantity', notnull: 1 },
      { name: 'quote_commodity', notnull: 1 },
    ],
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO prices (entry_id, date, base_commodity, quote_quantity)
      VALUES (1, '2024-01-01', 'FUND', '10')
    `).run(),
    /NOT NULL constraint failed: prices\.quote_commodity/u,
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO postings
        (id, transaction_id, position, report_date, line, column, account, amount_quantity)
      VALUES (1, 1, 0, '2024-01-01', 1, 1, 'Assets:Fund', '10')
    `).run(),
    /CHECK constraint failed/u,
  );
});

test('recreates a supported legacy cache with the current schema', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO metadata (key, value) VALUES ('schema_version', '12');
    CREATE TABLE transactions (
      entry_id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      status TEXT,
      code TEXT,
      description TEXT NOT NULL
    );
    INSERT INTO transactions (entry_id, date, status, code, description)
    VALUES (1, '2024-01-01', '*', 'opening', 'Opening');
  `);

  migrateDatabase(database);

  const columns = database.pragma('table_info(transactions)').map((column) => column.name);
  assert.ok(!columns.includes('status'));
  assert.ok(!columns.includes('code'));
  assert.equal(database.prepare('SELECT COUNT(*) FROM transactions').pluck().get(), 0);
  const tables = database.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table'",
  ).pluck().all();
  assert.ok(tables.includes('database_metadata'));
  assert.ok(!tables.includes('metadata'));
});

test('rejects unsupported schema versions', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO metadata (key, value) VALUES ('schema_version', '99');
  `);

  assert.throws(
    () => migrateDatabase(database),
    /Unsupported Ledlight database schema version: 99/u,
  );
});
