'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { asValue } = require('awilix');
const packageMetadata = require('../../../../package.json');
const { createRepositoryContainer } = require('../../../../src/composition/repository-container');
const sqliteModulePath = require.resolve('better-sqlite3');
const ledlightPath = path.resolve(__dirname, '../../../..');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-api-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

test('exposes the supported public API without eagerly loading SQLite', () => {
  delete require.cache[sqliteModulePath];

  const ledlight = require(ledlightPath);
  assert.deepEqual(Object.keys(ledlight), ['openJournal', 'parseLedgerText']);
  assert.equal(require.cache[sqliteModulePath], undefined);
});

test('validates public parser API inputs', () => {
  const { parseLedgerText } = require(ledlightPath);
  assert.throws(
    () => parseLedgerText(123),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => parseLedgerText('account Assets:Cash\n', { unknown: true }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
});

test('exposes transaction and posting tags separately from comments', (t) => {
  const { openJournal, parseLedgerText } = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-entry-tags-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const source = `commodity SEK
  default
account Assets:Cash
account Equity:Opening
tag Reviewed
tag Imported
tag Source
tag Receipt
2024-01-01 Tagged ; :Reviewed:Imported: bank statement
  ; Source: statement.csv
  Assets:Cash  1 SEK ; [2024-01-02] :Receipt: card payment
  Equity:Opening  -1 SEK
`;
  fs.writeFileSync(journalPath, source);

  const parsed = parseLedgerText(source).entries.at(-1);
  assert.deepEqual(parsed.tags, [
    { name: 'Reviewed', value: null },
    { name: 'Imported', value: null },
    { name: 'Source', value: 'statement.csv' },
  ]);
  assert.deepEqual(parsed.comments.map(({ text }) => text), ['bank statement']);
  assert.deepEqual(parsed.postings[0].tags, [{ name: 'Receipt', value: null }]);
  assert.deepEqual(parsed.postings[0].comments.map(({ text }) => text), ['card payment']);

  const journal = openJournal(journalPath);
  const transaction = journal.transactions().transactions[0];
  assert.deepEqual(transaction.tags, parsed.tags);
  assert.deepEqual(transaction.comments, ['bank statement']);
  assert.deepEqual(transaction.postings[0].tags, parsed.postings[0].tags);
  assert.deepEqual(transaction.postings[0].comments, ['card payment']);
  assert.equal(transaction.postings[0].postingDate, '2024-01-02');
  assert.deepEqual(Object.getOwnPropertyNames(transaction), Object.keys(transaction));
  assert.deepEqual(
    Object.getOwnPropertyNames(transaction.postings[0]),
    Object.keys(transaction.postings[0]),
  );

  const posting = journal.postings({ accounts: ['Assets:Cash'] })[0];
  assert.deepEqual(posting.transactionTags, parsed.tags);
  assert.deepEqual(posting.postingTags, parsed.postings[0].tags);
  assert.deepEqual(posting.transactionComments, ['bank statement']);
  assert.deepEqual(posting.postingComments, ['card payment']);
});

test('exposes stable error code strings instead of public error classes', (t) => {
  const ledlight = require(ledlightPath);

  assert.throws(
    () => ledlight.openJournal('/missing/journal.ledger'),
    (error) => error.code === 'LEDLIGHT_PROJECT_CONFIGURATION',
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-error-codes-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, 'account Assets:Cash\n');
  const journal = ledlight.openJournal(journalPath);
  assert.throws(
    () => journal.aggregate({ unknown: true }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => journal.aggregate({ denominate: true }),
    (error) => error.code === 'LEDLIGHT_MISSING_VALUATION_DATA',
  );
  fs.rmSync(journal.databasePath);
  assert.throws(
    () => journal.accounts(),
    (error) => error.code === 'LEDLIGHT_DATABASE',
  );
});

test('persists foreign lot cost warnings for every report and rebuilds older caches', (t) => {
  const { openJournal } = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-foreign-basis-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
  format 1,000.00 SEK
commodity USD
  format 1,000.00 USD
commodity STOCK
  format 1,000 STOCK
account Assets:Stock
account Assets:USD
account Assets:Cash
P 2024-01-01 STOCK 30 SEK
P 2024-01-01 USD 2 SEK

2024-01-01 Buy dollars
  Assets:USD  10 USD {2 SEK}
  Assets:Cash  -20 SEK

2024-01-01 Buy shares
  Assets:Stock  1 STOCK {10 USD}
  Assets:USD
`);
  const journal = openJournal(journalPath);
  const message = 'Assets:Stock: lot cost in USD must be expressed in the default commodity SEK. ' +
    'Unrealized gains omit affected positions; their totals may be incomplete';
  assert.deepEqual(journal.warnings.map(({ code, message }) => ({ code, message })), [{
    code: 'FOREIGN_LOT_COST_CURRENCY', message,
  }, {
    code: 'INVALID_COMMODITY_TRADE',
    message: 'Negative USD posting must use both a lot cost ({...} or {{...}}) ' +
      'and a transaction price (@ or @@); the default commodity is SEK',
  }]);
  assert.equal(journal.warnings[0].instances[0].line, 19);
  assert.deepEqual(openJournal(journalPath).warnings, journal.warnings);
  const Database = require(sqliteModulePath);
  const previousCache = new Database(journal.databasePath);
  try {
    previousCache.prepare("UPDATE database_metadata SET value = '26' WHERE key = 'schema_version'").run();
    previousCache.prepare('DELETE FROM ingestion_warnings').run();
  } finally {
    previousCache.close();
  }
  const rebuilt = openJournal(journalPath);
  assert.equal(rebuilt.rebuilt, true);
  assert.deepEqual(rebuilt.warnings, journal.warnings);
  fs.writeFileSync(journalPath, fs.readFileSync(journalPath, 'utf8').replace(
    '1 STOCK {10 USD}\n  Assets:USD\n',
    '1 STOCK {20 SEK}\n  Assets:USD  -10 USD {2 SEK} @ 2 SEK\n',
  ));
  const correctedJournal = openJournal(journalPath);
  assert.deepEqual(correctedJournal.warnings, []);
});

test('renders CLI help and the public package version without opening a project', () => {
  const container = createRepositoryContainer();
  const project = container.resolve('project');
  let stdout = '';
  let stderr = '';
  container.register({
    project: asValue({
      ...project,
      openJournal: () => assert.fail('help and version must not open a project'),
    }),
    output: asValue({
      writeError(value) { stderr += value; },
      writeOutput(value) { stdout += value; },
    }),
  });
  const executeCli = container.resolve('executeCli');
  function run(arguments_) {
    stdout = '';
    stderr = '';
    assert.equal(executeCli.run(arguments_), 0);
    assert.equal(stderr, '');
    return stdout;
  }

  assert.match(run(['--help']), /^Usage:/u);
  assert.equal(run(['--version']), `${packageMetadata.version}\n`);
});

test('loads SQLite only when a journal is opened', (t) => {
  delete require.cache[sqliteModulePath];
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-public-api-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(
    journalPath,
    'commodity SEK\n  default\naccount Assets:Cash\n',
  );

  assert.equal(require.cache[sqliteModulePath], undefined);

  const journal = ledlight.openJournal(journalPath);
  assert.match(journal.databasePath, /journals\/[a-f\d]{64}\/ledger\.sqlite$/u);
  assert.equal(journal.databasePath.startsWith(cacheDirectory), true);
  assert.ok(require.cache[sqliteModulePath]);
  assert.equal(journal.journalPath, fs.realpathSync.native(journalPath));
  assert.equal(Object.hasOwn(journal, 'reconciliationEntries'), false);
});

test('returns all transactions without pagination and paginates only when requested', (t) => {
  const { openJournal } = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-transactions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const entries = Array.from({ length: 501 }, (_value, index) => `
2024-01-01 Entry ${index + 1}
  Assets:Cash  1 SEK
  Equity:Opening  -1 SEK
`).join('');
  fs.writeFileSync(journalPath, `commodity SEK
  format 1,000.00 SEK
  default
account Assets:Cash
account Equity:Opening
${entries}`);

  const journal = openJournal(journalPath);
  const unpaginated = journal.transactions();
  assert.equal(unpaginated.totalTransactions, 501);
  assert.equal(unpaginated.transactions.length, 501);
  assert.equal(unpaginated.transactions[500].description, 'Entry 501');
  assert.equal(unpaginated.transactions[500].postings.length, 2);
  assert.equal(Object.hasOwn(unpaginated, 'page'), false);
  assert.equal(Object.hasOwn(unpaginated, 'pageSize'), false);
  assert.equal(Object.hasOwn(unpaginated, 'totalPages'), false);

  const paginated = journal.transactions({ page: 2, pageSize: 500 });
  assert.equal(paginated.page, 2);
  assert.equal(paginated.pageSize, 500);
  assert.equal(paginated.totalPages, 2);
  assert.equal(paginated.transactions.length, 1);
  assert.equal(paginated.transactions[0].description, 'Entry 501');
});

test('print returns plain journal text and validates its options', (t) => {
  const { openJournal } = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-print-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, 'account Assets:Cash\n');
  const journal = openJournal(journalPath);

  assert.equal(journal.print(), 'account Assets:Cash\n');
  fs.writeFileSync(journalPath, 'account Assets:Changed\n');
  assert.equal(journal.print(), 'account Assets:Cash\n');
  const Database = require(sqliteModulePath);
  const database = new Database(journal.databasePath);
  database.prepare("UPDATE account_declarations SET name = 'Assets:Database'").run();
  database.close();
  assert.equal(journal.print(), 'account Assets:Database\n');
  assert.equal(journal.print({}), 'account Assets:Database\n');
  assert.equal(journal.print({ density: 'compact', sortDeclarations: true }),
    'account Assets:Database\n');
  assert.throws(
    () => journal.print({ density: 'dense' }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => journal.print({ sortDeclarations: 'true' }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => journal.print({ unknown: true }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT' &&
      error.message === 'Unknown print option: unknown',
  );
});

test('returns query data while exposing ingestion warnings through the API and CLI', (t) => {
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-warnings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  format 1,000.00 SEK
  default
account Assets:Cash
account Equity:Opening
2024-02-30 Invalid date
  Assets:Ignored  100 SEK
  Equity:Opening
2024-01-01 Incorrect assertion and balance
  Assets:Cash  10 SEK = 11 SEK
  Equity:Opening  -9 SEK
`);

  const journal = ledlight.openJournal(journalPath);
  assert.deepEqual(journal.warnings.map(({ code }) => code), [
    'SYNTAX_ERROR',
    'BALANCE_ASSERTION_FAILED',
    'UNBALANCED_TRANSACTION',
  ]);
  assert.deepEqual(
    {
      source: journal.warnings[0].instances[0].source,
      startLine: journal.warnings[0].instances[0].startLine,
      endLine: journal.warnings[0].instances[0].endLine,
    },
    { source: fs.realpathSync.native(journalPath), startLine: 6, endLine: 8 },
  );
  assert.equal(Object.isFrozen(journal.warnings), true);
  assert.equal(Object.isFrozen(journal.warnings[0]), true);
  assert.equal(Object.isFrozen(journal.warnings[0].instances), true);
  assert.equal(Object.isFrozen(journal.warnings[0].instances[0]), true);
  assert.deepEqual(
    ledlight.openJournal(journalPath).warnings,
    journal.warnings,
    'warnings must remain available when the current database is reused',
  );

});

test('exposes full-history accounting diagnostics on open and across cached report commands', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-global-warnings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
commodity FUND
  format 1,000 FUND
account Assets:Broker
account Assets:Bank
P 2024-01-01 FUND 100 USD
2024-01-01 Purchase
  Assets:Broker  10 FUND {{1000 USD}}
  Assets:Bank  -1000 USD
2024-02-01 Bankruptcy with missing cost disposal
  Assets:Broker  -10 FUND {{0 USD}} @@ 0 USD
`);
  const { openJournal } = require(ledlightPath);
  const journal = openJournal(journalPath);
  assert.deepEqual(journal.warnings.map(({ code, message }) => ({ code, message })), [{
    code: 'RESIDUAL_COST_BASIS',
    message: 'Assets:Broker: zero FUND units retain cost basis 1000 USD',
  }]);
  assert.deepEqual(openJournal(journalPath).warnings, journal.warnings);
  const Database = require(sqliteModulePath);
  const previousCache = new Database(journal.databasePath);
  previousCache.prepare("UPDATE database_metadata SET value = '20' WHERE key = 'schema_version'").run();
  previousCache.prepare('DELETE FROM ingestion_warnings').run();
  previousCache.close();
  assert.deepEqual(openJournal(journalPath).warnings, journal.warnings,
    'opening an older cache must rebuild it with global accounting diagnostics');
});
