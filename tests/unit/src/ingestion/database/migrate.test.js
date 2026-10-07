'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { migrateDatabase } = resolveRepositoryModule("src/impl/ingestion/database/database-migration.js");

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
  assert.ok(tables.includes('ingestion_warnings'));
  assert.ok(!tables.includes('metadata'));
  assert.ok(tables.includes('journal_entries'));
  assert.ok(!tables.includes('transaction_tags'));
  assert.ok(!tables.includes('posting_tags'));
  assert.ok(!tables.includes('commodity_properties'));
  assert.ok(tables.includes('comments'));
  assert.ok(tables.includes('file_comments'));
  assert.ok(!tables.includes('notes'));
  assert.ok(!tables.includes('transaction_notes'));
  assert.ok(tables.includes('resolved_posting_amounts'));
  assert.ok(tables.includes('valuation_prices'));
  for (const table of [
    'account_declarations', 'tag_declarations', 'commodity_declarations',
  ]) {
    const used = database.pragma(`table_info(${table})`)
      .find((column) => column.name === 'used');
    assert.equal(used.notnull, 1);
    assert.equal(used.dflt_value, '0');
  }
  const reportDate = database.pragma('table_info(postings)')
    .find((column) => column.name === 'posting_date');
  assert.equal(reportDate.notnull, 1);
  const postingColumns = database.pragma('table_info(postings)').map((column) => column.name);
  assert.ok(postingColumns.includes('lot_cost_quantity'));
  assert.ok(postingColumns.includes('lot_cost_commodity'));
  assert.ok(postingColumns.includes('lot_cost_is_total'));
  assert.ok(!postingColumns.includes('comment'));
  assert.ok(!postingColumns.includes('line'));
  assert.ok(!database.pragma('table_info(comments)').some((column) => column.name === 'line'));
  assert.deepEqual(
    database.pragma('table_info(file_comments)').map((column) => column.name),
    ['entry_id', 'text'],
  );
  assert.deepEqual(
    database.pragma('foreign_key_list(file_comments)')
      .map(({ table, from, to }) => ({ table, from, to })),
    [{ table: 'journal_entries', from: 'entry_id', to: 'id' }],
  );
  const runningBalance = database.pragma('table_info(resolved_posting_amounts)')
    .find((column) => column.name === 'running_balance');
  assert.equal(runningBalance.notnull, 1);
  assert.equal(runningBalance.dflt_value, "'0'");
  assert.deepEqual(
    database.pragma('index_info(postings_account_posting_date)')
      .map((column) => column.name),
    ['account', 'posting_date'],
  );
  assert.deepEqual(
    database.pragma('index_info(postings_posting_date)')
      .map((column) => column.name),
    ['posting_date'],
  );
  const commodityColumns = database.pragma('table_info(commodity_declarations)')
    .map((column) => column.name);
  assert.ok(commodityColumns.includes('format'));
  assert.ok(commodityColumns.includes('is_default'));
  const transactionColumns = database.pragma('table_info(transactions)').map((column) => column.name);
  assert.ok(!transactionColumns.includes('status'));
  assert.ok(!transactionColumns.includes('code'));
  assert.ok(!transactionColumns.includes('payee'));
  assert.ok(!transactionColumns.includes('narration'));
  assert.ok(!transactionColumns.includes('comment'));
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
        (id, transaction_id, position, posting_date, account, amount_quantity)
      VALUES (1, 1, 0, '2024-01-01', 'Assets:Fund', '10')
    `).run(),
    /CHECK constraint failed/u,
  );
});

test('enforces unique account, commodity, and tag declaration names', (t) => {
  const database = temporaryDatabase(t);
  migrateDatabase(database);
  database.exec(`
    INSERT INTO source_files (id, path, sha256, size)
    VALUES (1, 'fixture.ledger', '${'0'.repeat(64)}', 0);
    INSERT INTO journal_entries (id, source_file_id, line) VALUES
      (1, 1, 1), (2, 1, 2), (3, 1, 3),
      (4, 1, 4), (5, 1, 5), (6, 1, 6);
    INSERT INTO account_declarations (entry_id, name) VALUES (1, 'Assets:Cash');
    INSERT INTO commodity_declarations (entry_id, symbol) VALUES (3, 'SEK');
    INSERT INTO tag_declarations (entry_id, name) VALUES (5, 'Reviewed');
  `);

  assert.throws(
    () => database.prepare(`
      INSERT INTO account_declarations (entry_id, name) VALUES (2, 'Assets:Cash')
    `).run(),
    /UNIQUE constraint failed: account_declarations\.name/u,
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO commodity_declarations (entry_id, symbol) VALUES (4, 'SEK')
    `).run(),
    /UNIQUE constraint failed: commodity_declarations\.symbol/u,
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO tag_declarations (entry_id, name) VALUES (6, 'Reviewed')
    `).run(),
    /UNIQUE constraint failed: tag_declarations\.name/u,
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

test('replaces version 28 comments and transaction notes with current comment tables', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO database_metadata (key, value) VALUES ('schema_version', '28');
    CREATE TABLE transactions (entry_id INTEGER PRIMARY KEY, comment TEXT);
    CREATE TABLE transaction_notes (transaction_id INTEGER, position INTEGER, text TEXT);
  `);

  migrateDatabase(database);

  const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .pluck().all();
  assert.ok(tables.includes('comments'));
  assert.ok(tables.includes('file_comments'));
  assert.ok(!tables.includes('transaction_notes'));
  assert.ok(!database.pragma('table_info(transactions)').some((column) => column.name === 'comment'));
});

test('replaces version 29 notes with current comment tables', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO database_metadata (key, value) VALUES ('schema_version', '29');
    CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);
  `);

  migrateDatabase(database);

  const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .pluck().all();
  assert.ok(tables.includes('comments'));
  assert.ok(tables.includes('file_comments'));
  assert.ok(!tables.includes('notes'));
});

test('replaces version 30 file comments with entry-owned comments', (t) => {
  const database = temporaryDatabase(t);
  database.exec(`
    CREATE TABLE database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
    INSERT INTO database_metadata (key, value) VALUES ('schema_version', '30');
    CREATE TABLE file_comments (source_file_id INTEGER, line INTEGER, text TEXT);
  `);

  migrateDatabase(database);

  assert.deepEqual(
    database.pragma('table_info(file_comments)').map((column) => column.name),
    ['entry_id', 'text'],
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
