'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const {
  databasePathForJournal,
  errorCodes,
  openJournal,
} = resolveRepositoryModule("src/api/index.js");
const {
  ensureDatabaseCurrent,
} = resolveRepositoryModule("src/ingestion/database/database.js");
const {
  buildDatabase,
  checkDatabaseSync,
} = resolveRepositoryModule("src/ingestion/database/database.js").$$private;
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-database-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

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
  default
  format 1,000.00 SEK
include transactions.ledger
P 2024-01-01 FUND 123.45 SEK
`);
  fs.writeFileSync(transactionsPath, `2024-01-02 Bank | Deposit ; :imported: bank statement
  ; Source: statement.csv:4
  Assets:Cash  8.000000000000000001 SEK ; Receipt: 1234
  Equity:Opening  ; :balanced:
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
      SELECT t.date, p.position, p.report_date, p.account,
        p.amount_quantity, p.amount_commodity
      FROM transactions AS t
      JOIN postings AS p ON p.transaction_id = t.entry_id
      ORDER BY p.position
    `).all(),
    [
      {
        date: '2024-01-02',
        position: 0,
        report_date: '2024-01-02',
        account: 'Assets:Cash',
        amount_quantity: '8.000000000000000001',
        amount_commodity: 'SEK',
      },
      {
        date: '2024-01-02',
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
    database.prepare(`
      SELECT tags.position, tags.name, tags.value, notes.position AS note_position
      FROM transaction_tags AS tags
      LEFT JOIN transaction_notes AS notes ON notes.id = tags.note_id
      ORDER BY tags.position
    `).all(),
    [
      { position: 0, name: 'imported', value: null, note_position: null },
      { position: 1, name: 'Source', value: 'statement.csv:4', note_position: 0 },
    ],
  );
  assert.deepEqual(
    database.prepare(`
      SELECT postings.position AS posting_position, tags.position, tags.name, tags.value
      FROM posting_tags AS tags
      JOIN postings ON postings.id = tags.posting_id
      ORDER BY postings.position, tags.position
    `).all(),
    [
      { posting_position: 0, position: 0, name: 'Receipt', value: '1234' },
      { posting_position: 1, position: 0, name: 'balanced', value: null },
    ],
  );
  assert.deepEqual(
    database.prepare("SELECT name, value FROM commodity_properties WHERE name = 'format'").get(),
    { name: 'format', value: '1,000.00 SEK' },
  );
  assert.deepEqual(
    database.prepare('SELECT commodity, date, rate FROM valuation_prices').all(),
    [
      { commodity: 'FUND', date: '2024-01-01', rate: '123.45' },
      { commodity: 'FUND', date: '2024-01-02', rate: '123.45' },
      { commodity: 'SEK', date: '2024-01-01', rate: '1' },
      { commodity: 'SEK', date: '2024-01-02', rate: '1' },
    ],
  );
  assert.equal(result.valuationPrices, 4);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});

test('stores lot costs separately from transaction costs', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  default
2024-01-01 Sale
  Assets:Broker  -10 AAPL {{1000 USD}} @@ 1200 USD
  Assets:Bank  1200 USD
  Income:Capital Gains  -200 USD
`);

  buildDatabase(databasePath, journalPath);
  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(`
      SELECT lot_cost_quantity, lot_cost_commodity, lot_cost_is_total,
        cost_quantity, cost_commodity, cost_is_total
      FROM postings
      WHERE account = 'Assets:Broker'
    `).get(),
    {
      lot_cost_quantity: '1000',
      lot_cost_commodity: 'USD',
      lot_cost_is_total: 1,
      cost_quantity: '1200',
      cost_commodity: 'USD',
      cost_is_total: 1,
    },
  );
});

test('loads the Ledger-compatible price history once per journal', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
P 2024-01-01 FUND 10 SEK
2024-01-01 Opening
  Assets:Fund  1 FUND {10 SEK}
  Equity:Opening  -10 SEK
`);

  const journal = openJournal(journalPath);
  const resolver = journal.ledgerValuationRateResolver();
  assert.equal(resolver('FUND', '2024-01-01'), '10');
  assert.equal(journal.ledgerValuationRateResolver(), resolver);
});

test('materializes the same resolvable price choice used by the public resolver', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  default
commodity FUND
commodity NOK
P 2024-01-01 FUND 10 USD
P 2024-02-01 FUND 2 NOK
2024-03-01 Holding
  Assets:Fund  3 FUND {10 USD}
  Equity:Opening  -30 USD
`);

  buildDatabase(databasePath, journalPath);
  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(`
      SELECT commodity, date, rate
      FROM valuation_prices
      WHERE commodity = 'FUND' AND date IN ('2024-01-31', '2024-02-01', '2024-03-01')
      ORDER BY date
    `).all(),
    [
      { commodity: 'FUND', date: '2024-01-31', rate: '10' },
      { commodity: 'FUND', date: '2024-02-01', rate: '10' },
      { commodity: 'FUND', date: '2024-03-01', rate: '10' },
    ],
  );
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
    journalPath,
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

test('rejects non-default commodity trades without direction-specific annotations', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-01 Invalid purchase
  Assets:Fund  1 FUND @ 10 SEK
  Assets:Cash  -10 SEK
`);

  assert.throws(
    () => buildDatabase(databasePath, journalPath),
    (error) => error.code === errorCodes.DATABASE &&
      /journal\.ledger:4:3: Positive FUND posting must use a lot cost .* and no transaction price .* default commodity is SEK/u.test(error.message),
  );
  assert.equal(fs.existsSync(databasePath), false);
});

test('rejects every second default commodity declaration', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  default
commodity USD
  default
`);

  assert.throws(
    () => buildDatabase(databasePath, journalPath),
    (error) => error.code === errorCodes.PROJECT_CONFIGURATION &&
      /journal\.ledger:4:3: Multiple commodity declarations are marked default/u.test(error.message) &&
      /first is at .*journal\.ledger:2:3/u.test(error.message),
  );
  assert.equal(fs.existsSync(databasePath), false);
});

test('aggregate CLI builds stale databases but reuses current databases', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const cliPath = path.resolve(__dirname, '../../../../../src/cli/run.js');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-01 Opening
  Assets:Cash,Main  1 SEK
  Equity:Opening
`);
  const databasePath = databasePathForJournal(journalPath);

  const first = execFileSync(process.execPath, [
    cliPath, 'aggregate', '--file', journalPath, '--to', '2024-01-01', '--accounts', 'Assets:',
  ], { cwd: directory, encoding: 'utf8', env: process.env });
  assert.equal(first, 'Assets:Cash,Main  1 SEK\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);

  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-01 Opening
  Assets:Cash,Main  2.005 SEK
  Assets:LongAccount  10000 SEK
  Equity:Opening
`);
  const second = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--to', '2024-01-01', '--accounts', 'Assets:'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(second, '  Assets:Cash,Main       2.005 SEK\nAssets:LongAccount  10,000     SEK\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);

  const csv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--csv'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(
    csv,
    'account,amount,commodity\n"Assets:Cash,Main",2.005,SEK\nAssets:LongAccount,10000,SEK\n',
  );

  const roundedCsv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--value', '--csv'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(
    roundedCsv,
    'account,amount,commodity\n"Assets:Cash,Main",2.01,SEK\nAssets:LongAccount,10000.00,SEK\n',
  );

  const roundedHumanReadable = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--value'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(
    roundedHumanReadable,
    '  Assets:Cash,Main       2.01 SEK\nAssets:LongAccount  10,000.00 SEK\n             --------------------\n             Total  10,002.01 SEK\n',
  );

  const invertedHumanReadable = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--value', '--invert'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(
    invertedHumanReadable,
    '  Assets:Cash,Main       -2.01 SEK\nAssets:LongAccount  -10,000.00 SEK\n             ---------------------\n             Total  -10,002.01 SEK\n',
  );

  const invertedCsv = execFileSync(
    process.execPath,
    [cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--invert', '--csv'],
    { cwd: directory, encoding: 'utf8', env: process.env },
  );
  assert.equal(
    invertedCsv,
    'account,amount,commodity\n"Assets:Cash,Main",-2.005,SEK\nAssets:LongAccount,-10000,SEK\n',
  );
});
