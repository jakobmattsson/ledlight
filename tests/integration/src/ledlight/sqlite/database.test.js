'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { openProject } = resolveRepositoryModule("src/ledlight/index.js");
const {
  buildDatabase,
  checkDatabaseSync,
  ensureDatabaseCurrent,
} = resolveRepositoryModule("src/ledlight/sqlite/database.js");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('stores a journal as normalized, queryable SQLite data', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  const transactionsPath = path.join(directory, 'transactions.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `account Assets:Cash
commodity SEK
  format 1,000.00 SEK
include transactions.ledger
P 2024-01-01 FUND 123.45 SEK
`);
  fs.writeFileSync(transactionsPath, `2024-01-02 * (opening) Bank | Deposit
  ; Source: statement.csv:4
  Assets:Cash  8.000000000000000001 SEK
  Equity:Opening
`);

  const result = buildDatabase(databasePath, journalPath);
  assert.deepEqual(
    {
      files: result.files,
      entries: result.entries,
      transactions: result.transactions,
      postings: result.postings,
      prices: result.prices,
    },
    { files: 2, entries: 4, transactions: 1, postings: 2, prices: 1 },
  );

  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(`
      SELECT t.date, t.code, p.position, p.report_date, p.account,
        p.amount_quantity, p.amount_commodity
      FROM transactions AS t
      JOIN postings AS p ON p.transaction_id = t.entry_id
      ORDER BY p.position
    `).all(),
    [
      {
        date: '2024-01-02',
        code: 'opening',
        position: 0,
        report_date: '2024-01-02',
        account: 'Assets:Cash',
        amount_quantity: '8.000000000000000001',
        amount_commodity: 'SEK',
      },
      {
        date: '2024-01-02',
        code: 'opening',
        position: 1,
        report_date: '2024-01-02',
        account: 'Equity:Opening',
        amount_quantity: null,
        amount_commodity: null,
      },
    ],
  );
  assert.deepEqual(
    database.prepare('SELECT key, value FROM transaction_notes').get(),
    { key: 'Source', value: 'statement.csv:4' },
  );
  assert.deepEqual(
    database.prepare('SELECT name, value FROM commodity_properties').get(),
    { name: 'format', value: '1,000.00 SEK' },
  );
  assert.deepEqual(
    database.prepare('SELECT commodity, date, rate FROM sek_prices').all(),
    [
      { commodity: 'FUND', date: '2024-01-01', rate: '123.45' },
      { commodity: 'FUND', date: '2024-01-02', rate: '123.45' },
      { commodity: 'SEK', date: '2024-01-01', rate: '1' },
      { commodity: 'SEK', date: '2024-01-02', rate: '1' },
    ],
  );
  assert.equal(result.sekPrices, 4);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});

test('loads the Ledger-compatible price history once per project', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(journalPath, `P 2024-01-01 FUND 10 SEK
2024-01-01 Opening
  Assets:Fund  1 FUND
  Equity:Opening  -10 SEK
`);

  const project = openProject(directory);
  const resolver = project.ledgerSekRateResolver();
  assert.equal(resolver('FUND', '2024-01-01', new Set()), '10');
  assert.equal(project.ledgerSekRateResolver(), resolver);
});

test('detects when source files and database contents differ', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  const transactionsPath = path.join(directory, 'transactions.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, 'include transactions.ledger\n');
  fs.writeFileSync(transactionsPath, '2024-01-01 Opening\n  Assets:Cash  1 SEK\n  Equity:Opening\n');

  assert.equal(checkDatabaseSync(databasePath, journalPath).reason, 'database_missing');
  buildDatabase(databasePath, journalPath);
  assert.deepEqual(checkDatabaseSync(databasePath, journalPath), {
    databasePath,
    rootPath: journalPath,
    inSync: true,
    reason: 'in_sync',
    added: [],
    removed: [],
    changed: [],
  });

  fs.writeFileSync(transactionsPath, '2024-01-01 Opening\n  Assets:Cash  2 SEK\n  Equity:Opening\n');
  const status = checkDatabaseSync(databasePath, journalPath);
  assert.equal(status.inSync, false);
  assert.equal(status.reason, 'source_files_changed');
  assert.deepEqual(status.changed, [transactionsPath]);
});

test('detects source files added to and removed from an include glob', (t) => {
  const directory = temporaryDirectory(t);
  const entriesDirectory = path.join(directory, 'entries');
  fs.mkdirSync(entriesDirectory);
  const journalPath = path.join(directory, 'all.ledger');
  const firstPath = path.join(entriesDirectory, 'first.ledger');
  const secondPath = path.join(entriesDirectory, 'second.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, 'include entries/*.ledger\n');
  fs.writeFileSync(firstPath, 'account Assets:First\n');
  buildDatabase(databasePath, journalPath);

  fs.writeFileSync(secondPath, 'account Assets:Second\n');
  let status = checkDatabaseSync(databasePath, journalPath);
  assert.equal(status.reason, 'source_files_changed');
  assert.deepEqual(status.added, [secondPath]);
  assert.deepEqual(status.removed, []);

  fs.rmSync(firstPath);
  status = checkDatabaseSync(databasePath, journalPath);
  assert.equal(status.reason, 'source_files_changed');
  assert.deepEqual(status.added, [secondPath]);
  assert.deepEqual(status.removed, [firstPath]);
});

test('rejects commodity-less resolved amounts before database insertion', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `2024-01-01 Missing commodity
  Assets:Cash  1
  Equity:Opening
`);

  assert.throws(
    () => buildDatabase(databasePath, journalPath),
    (error) => /journal\.ledger:2.*commodity/u.test(error.message) &&
      !/SQLITE_CONSTRAINT/u.test(error.code || ''),
  );
  assert.equal(fs.existsSync(databasePath), false);
});

test('aggregate CLI builds stale databases but reuses current databases', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'tmp', 'ledger.sqlite');
  const cliPath = path.resolve(__dirname, '../../../../../src/ledlight/cli/run.js');
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(journalPath, `2024-01-01 Opening
  Assets:Cash,Main  1 SEK
  Equity:Opening
`);

  const first = execFileSync(process.execPath, [
    cliPath, 'aggregate', '--to', '2024-01-01', '--accounts', 'Assets:',
  ], { cwd: directory, encoding: 'utf8' });
  assert.equal(first, 'Assets:Cash,Main  1 SEK\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);

  fs.writeFileSync(journalPath, `2024-01-01 Opening
  Assets:Cash,Main  2.005 SEK
  Assets:LongAccount  10000 SEK
  Equity:Opening
`);
  const second = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--to', '2024-01-01', '--accounts', 'Assets:'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(second, '  Assets:Cash,Main       2.005 SEK\nAssets:LongAccount  10,000     SEK\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);

  const csv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--accounts', 'Assets:', '--csv'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(
    csv,
    'account,amount,commodity\n"Assets:Cash,Main",2.005,SEK\nAssets:LongAccount,10000,SEK\n',
  );

  const roundedCsv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--accounts', 'Assets:', '--sek', '--csv'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(
    roundedCsv,
    'account,amount,commodity\n"Assets:Cash,Main",2.01,SEK\nAssets:LongAccount,10000.00,SEK\n',
  );

  const roundedHumanReadable = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--accounts', 'Assets:', '--sek'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(
    roundedHumanReadable,
    '  Assets:Cash,Main       2.01 SEK\nAssets:LongAccount  10,000.00 SEK\n             --------------------\n             Total  10,002.01 SEK\n',
  );

  const invertedHumanReadable = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--accounts', 'Assets:', '--sek', '--invert'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(
    invertedHumanReadable,
    '  Assets:Cash,Main       -2.01 SEK\nAssets:LongAccount  -10,000.00 SEK\n             ---------------------\n             Total  -10,002.01 SEK\n',
  );

  const invertedCsv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--accounts', 'Assets:', '--invert', '--csv'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(
    invertedCsv,
    'account,amount,commodity\n"Assets:Cash,Main",-2.005,SEK\nAssets:LongAccount,-10000,SEK\n',
  );
});
