'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');
const { execFileSync, spawnSync } = require('node:child_process');
const packageMetadata = require('../../../../package.json');
const sqliteModulePath = require.resolve('better-sqlite3');
const ledlightPath = path.resolve(__dirname, '../../../..');
const cliPath = path.join(ledlightPath, 'src/cli/run.js');
const { apiCommands } = resolveRepositoryModule('src/cli/cli-arguments.js');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-api-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

test('exposes the supported public API without eagerly loading SQLite', () => {
  delete require.cache[sqliteModulePath];

  const ledlight = require(ledlightPath);
  assert.deepEqual(Object.keys(ledlight), ['openJournal']);
  assert.equal(require.cache[sqliteModulePath], undefined);
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
    () => journal.aggregateReport({ unknown: true }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => journal.aggregateReport({ inValuationCommodity: true }),
    (error) => error.code === 'LEDLIGHT_MISSING_VALUATION_DATA',
  );
  fs.rmSync(journal.databasePath);
  assert.throws(
    () => journal.accounts(),
    (error) => error.code === 'LEDLIGHT_DATABASE',
  );
});

test('prints CLI help and the public package version without opening a project', () => {
  assert.match(execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' }), /^Usage:/u);
  assert.equal(
    execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }),
    `${packageMetadata.version}\n`,
  );
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
  const journalOperations = Object.entries(journal)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
  assert.deepEqual(
    journalOperations.sort(),
    Object.keys(apiCommands).sort(),
    'every journal operation must have a CLI command',
  );
  assert.equal(journal.journalPath, fs.realpathSync.native(journalPath));
  assert.deepEqual(journal.accountBalances({ account: 'Assets:Cash' }), []);
  assert.deepEqual(journal.accountPostings({ account: 'Assets:Cash' }), []);
  assert.deepEqual(journal.aggregateReport(), []);
  assert.deepEqual(journal.balanceHistoryReport(), []);
  assert.deepEqual(journal.gainReport(), []);
  assert.deepEqual(journal.reconciliationEntries({ accounts: ['Assets:Cash'] }), []);
  assert.deepEqual(journal.commodityDescriptions(), [{
    commodity: 'SEK',
    comment: null,
    format: null,
    isDefault: true,
  }]);
  assert.deepEqual(journal.investmentPerformance(), {
    from: null,
    to: null,
    commodities: [],
    valuationCommodity: 'SEK',
    openingValue: 0,
    endingValue: 0,
    netContributions: 0,
    profitLoss: 0,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
    points: [],
  });
});

test('returns query data while exposing ingestion warnings through the API and CLI', (t) => {
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-warnings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity SEK
  default
2024-02-30 Invalid date
  Assets:Ignored  100 SEK
  Equity:Opening
2024-01-01 Incorrect assertion and balance
  Assets:Cash  10 SEK = 11 SEK
  Equity:Opening  -9 SEK
`);

  const journal = ledlight.openJournal(journalPath);
  assert.deepEqual(journal.aggregateReport({ accounts: ['Assets:'] }), [
    { account: 'Assets:Cash', quantity: '10', commodity: 'SEK' },
  ]);
  assert.deepEqual(journal.warnings.map(({ code }) => code), [
    'SYNTAX_ERROR',
    'BALANCE_ASSERTION_FAILED',
    'UNBALANCED_TRANSACTION',
  ]);
  assert.deepEqual(
    {
      source: journal.warnings[0].source,
      startLine: journal.warnings[0].startLine,
      endLine: journal.warnings[0].endLine,
    },
    { source: fs.realpathSync.native(journalPath), startLine: 3, endLine: 5 },
  );
  assert.equal(Object.isFrozen(journal.warnings), true);
  assert.deepEqual(
    ledlight.openJournal(journalPath).warnings,
    journal.warnings,
    'warnings must remain available when the current database is reused',
  );

  const cli = spawnSync(process.execPath, [
    cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--json',
  ], { cwd: directory, encoding: 'utf8', env: process.env });
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(cli.stdout), [
    { account: 'Assets:Cash', quantity: '10', commodity: 'SEK' },
  ]);
  assert.deepEqual(JSON.parse(cli.stderr).map(({ code }) => code), [
    'SYNTAX_ERROR',
    'BALANCE_ASSERTION_FAILED',
    'UNBALANCED_TRANSACTION',
  ]);
});
