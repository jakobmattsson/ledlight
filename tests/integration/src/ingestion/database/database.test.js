'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { pathsForJournal } = resolveRepositoryModule("src/impl/core/cache-paths.js");
const {
  ensureDatabaseCurrent,
} = resolveRepositoryModule("src/impl/ingestion/database/database.js");
const {
  buildDatabase,
  checkDatabaseSync,
} = resolveRepositoryModule("src/impl/ingestion/database/database.js").$$private;
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
  ; Imported from the bank statement
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
      SELECT t.date, p.position, p.posting_date, p.account,
        p.amount_quantity, p.amount_commodity
      FROM transactions AS t
      JOIN postings AS p ON p.transaction_id = t.entry_id
      ORDER BY p.position
    `).all(),
    [
      {
        date: '2024-01-02',
        position: 0,
        posting_date: '2024-01-02',
        account: 'Assets:Cash',
        amount_quantity: '8.000000000000000001',
        amount_commodity: 'SEK',
      },
      {
        date: '2024-01-02',
        position: 1,
        posting_date: '2024-01-02',
        account: 'Equity:Opening',
        amount_quantity: null,
        amount_commodity: null,
      },
    ],
  );
  assert.deepEqual(
    database.prepare(`
      SELECT postings.account, amounts.quantity, amounts.commodity, amounts.running_balance
      FROM resolved_posting_amounts AS amounts
      JOIN postings ON postings.id = amounts.posting_id
      ORDER BY amounts.id
    `).all(),
    [
      {
        account: 'Assets:Cash',
        quantity: '8.000000000000000001',
        commodity: 'SEK',
        running_balance: '8.000000000000000001',
      },
      {
        account: 'Equity:Opening',
        quantity: '-8.000000000000000001',
        commodity: 'SEK',
        running_balance: '-8.000000000000000001',
      },
    ],
  );
  assert.equal(result.postingBalances, 2);
  assert.deepEqual(
    database.prepare(`
      SELECT transaction_id IS NOT NULL AS transaction_note, position, text
      FROM notes ORDER BY id
    `).all(),
    [
      { transaction_note: 1, position: 0, text: ':imported: bank statement' },
      { transaction_note: 1, position: 1, text: 'Source: statement.csv:4' },
      { transaction_note: 0, position: 0, text: 'Receipt: 1234' },
      { transaction_note: 0, position: 1, text: 'Imported from the bank statement' },
      { transaction_note: 0, position: 0, text: ':balanced:' },
    ],
  );
  assert.deepEqual(
    database.prepare("SELECT format, is_default FROM commodity_declarations WHERE symbol = 'SEK'").get(),
    { format: '1,000.00 SEK', is_default: 1 },
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

test('materializes exact account and commodity balances in posting-date order', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-01-03 Later date first in journal
  Assets:Cash  5 SEK
  Equity:Opening  -5 SEK

2024-01-01 Earlier date later in journal
  Assets:Cash  10 SEK
  Equity:Opening  -10 SEK

2024-01-02 Separate account and commodity
  Assets:Bank  7 SEK
  Assets:Cash  2 FUND
  Equity:Opening  -7 SEK
  Equity:Opening  -2 FUND
`);

  buildDatabase(databasePath, journalPath);
  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(database.prepare(`
    SELECT postings.account, postings.posting_date AS date,
      amounts.quantity, amounts.commodity, amounts.running_balance AS balance
    FROM resolved_posting_amounts AS amounts
    JOIN postings ON postings.id = amounts.posting_id
    WHERE postings.account LIKE 'Assets:%'
    ORDER BY postings.posting_date, postings.id, amounts.position
  `).all(), [
    { account: 'Assets:Cash', date: '2024-01-01', quantity: '10', commodity: 'SEK', balance: '10' },
    { account: 'Assets:Bank', date: '2024-01-02', quantity: '7', commodity: 'SEK', balance: '7' },
    { account: 'Assets:Cash', date: '2024-01-02', quantity: '2', commodity: 'FUND', balance: '2' },
    { account: 'Assets:Cash', date: '2024-01-03', quantity: '5', commodity: 'SEK', balance: '15' },
  ]);
});

test('materializes Ledger-compatible resolvable price choices', (t) => {
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

test('skips syntax-invalid transactions before database insertion', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `2024-01-01 Missing commodity
  Assets:Cash  1
  Equity:Opening
`);

  const result = buildDatabase(databasePath, journalPath);
  assert.equal(result.transactions, 0);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(
    {
      code: result.warnings[0].code,
      source: result.warnings[0].source,
      startLine: result.warnings[0].startLine,
      endLine: result.warnings[0].endLine,
    },
    { code: 'SYNTAX_ERROR', source: journalPath, startLine: 1, endLine: 3 },
  );
  assert.equal(fs.existsSync(databasePath), true);
});

test('stores non-default commodity trades and reports invalid annotations as warnings', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  format 1,000.00 SEK
  default
commodity FUND
  format 1000.00 FUND
account Assets:Fund
account Assets:Cash
2024-01-01 Invalid purchase
  Assets:Fund  1 FUND @ 10 SEK
  Assets:Cash  -10 SEK
`);

  const result = buildDatabase(databasePath, journalPath);
  assert.equal(result.transactions, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'INVALID_COMMODITY_TRADE');
  assert.match(result.warnings[0].message, /Positive FUND posting must use a lot cost/u);
  assert.equal(fs.existsSync(databasePath), true);
});

test('stores a zero-value non-default commodity acquisition', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity SEK
  format 1,000.00 SEK
  default
2024-01-01 Free subscription rights
  Assets:Rights  420 RIGHT {0 SEK} @ 0 SEK
`);

  assert.doesNotThrow(() => buildDatabase(databasePath, journalPath));
  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(`
      SELECT amount_quantity, amount_commodity,
        lot_cost_quantity, lot_cost_commodity,
        cost_quantity, cost_commodity
      FROM postings
    `).get(),
    {
      amount_quantity: '420',
      amount_commodity: 'RIGHT',
      lot_cost_quantity: '0',
      lot_cost_commodity: 'SEK',
      cost_quantity: '0',
      cost_commodity: 'SEK',
    },
  );
});

test('uses the first default commodity and warns about every later declaration', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
commodity EUR
  format 1,000.00 EUR
  default
`);

  const result = buildDatabase(databasePath, journalPath);
  assert.equal(result.valuationCommodity, 'USD');
  assert.deepEqual(result.warnings, [{
    code: 'MULTIPLE_DEFAULT_COMMODITIES',
    message: `Multiple commodity declarations are marked default; using the first at ${journalPath}:3:3`,
    source: journalPath,
    line: 6,
    column: 3,
    startLine: 6,
    endLine: 6,
  }]);
  const database = new Database(databasePath, { readonly: true });
  t.after(() => database.close());
  assert.deepEqual(database.prepare(`
    SELECT symbol FROM commodity_declarations WHERE is_default = 1
  `).pluck().all(), ['USD']);
  assert.equal(fs.existsSync(databasePath), true);
});

test('aggregate CLI builds stale databases but reuses current databases', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'journal.ledger');
  const cliPath = path.resolve(__dirname, '../../../../../src/impl/cli/run.js');
  fs.writeFileSync(journalPath, `commodity SEK
  default
account Assets:Cash,Main
account Equity:Opening
2024-01-01 Opening
  Assets:Cash,Main  1 SEK
  Equity:Opening
`);
  const { databasePath } = pathsForJournal(journalPath);

  function runAggregate() {
    const result = spawnSync(process.execPath, [
      cliPath, 'aggregate', '--file', journalPath, '--to', '2024-01-01', '--accounts', 'Assets:',
    ], { cwd: directory, encoding: 'utf8', env: process.env });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^\[MISSING_COMMODITY_FORMAT\] Commodity SEK must declare a format property/u);
    return result.stdout;
  }

  const first = runAggregate();
  assert.equal(first, '1 SEK  Assets:Cash,Main\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);

  fs.writeFileSync(journalPath, `commodity SEK
  default
account Assets:Cash,Main
account Assets:LongAccount
account Equity:Opening
2024-01-01 Opening
  Assets:Cash,Main  2.005 SEK
  Assets:LongAccount  10000 SEK
  Equity:Opening
`);
  const second = runAggregate();
  assert.equal(second, '     2.005 SEK  Assets:Cash,Main\n10,000     SEK  Assets:LongAccount\n');
  assert.equal(ensureDatabaseCurrent(databasePath).rebuilt, false);


});
