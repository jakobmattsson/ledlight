'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { migrateDatabase } = resolveRepositoryModule("src/ingestion/database/migrate.js");

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
  assert.ok(tables.includes('metadata'));
  assert.ok(tables.includes('journal_entries'));
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
  assert.ok(!transactionColumns.includes('effective_date'));
});

test('removes the unused transaction effective date from version 6', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO metadata (key, value) VALUES ('schema_version', '6');
    CREATE TABLE transactions (
      entry_id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      effective_date TEXT,
      description TEXT NOT NULL
    );
    INSERT INTO transactions (entry_id, date, effective_date, description)
    VALUES (1, '2024-01-01', NULL, 'Opening');
  `);

  migrateDatabase(database);

  const columns = database.pragma('table_info(transactions)').map((column) => column.name);
  assert.ok(!columns.includes('effective_date'));
  assert.deepEqual(
    database.prepare('SELECT entry_id, date, description FROM transactions').get(),
    { entry_id: 1, date: '2024-01-01', description: 'Opening' },
  );
});

test('adds the posting report date to a legacy schema', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO metadata (key, value) VALUES ('schema_version', '2');
    CREATE TABLE postings (id INTEGER PRIMARY KEY, account TEXT NOT NULL);
  `);

  migrateDatabase(database);

  const columns = database.pragma('table_info(postings)').map((column) => column.name);
  assert.ok(columns.includes('report_date'));
  assert.ok(columns.includes('lot_cost_quantity'));
});

test('renames the posting effective date while preserving version 3 data', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO metadata (key, value) VALUES ('schema_version', '3');
    CREATE TABLE postings (
      id INTEGER PRIMARY KEY,
      effective_date TEXT NOT NULL,
      account TEXT NOT NULL
    );
    INSERT INTO postings (id, effective_date, account)
    VALUES (1, '2024-03-02', 'Assets:Cash');
  `);

  migrateDatabase(database);

  const columns = database.pragma('table_info(postings)').map((column) => column.name);
  assert.ok(columns.includes('report_date'));
  assert.ok(!columns.includes('effective_date'));
  assert.equal(
    database.prepare('SELECT report_date FROM postings WHERE id = 1').pluck().get(),
    '2024-03-02',
  );
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
