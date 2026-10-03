'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');
const { execFileSync } = require('node:child_process');
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
  assert.deepEqual(Object.keys(ledlight).sort(), [
    'accountBalances',
    'accountPostings',
    'aggregateReport',
    'balanceHistoryReport',
    'databasePathForJournal',
    'ensureDatabaseCurrent',
    'gainReport',
    'investmentPerformance',
    'openJournal',
  ]);
  assert.equal(require.cache[sqliteModulePath], undefined);
});

test('exposes stable error code strings instead of public error classes', (t) => {
  const ledlight = require(ledlightPath);

  assert.throws(
    () => ledlight.databasePathForJournal('/missing/journal.ledger'),
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
    () => journal.ledgerAccounts(),
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

test('loads SQLite only when a journal database operation needs it', (t) => {
  delete require.cache[sqliteModulePath];
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-public-api-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(
    journalPath,
    'commodity SEK\n  default\naccount Assets:Cash\n',
  );

  const databasePath = ledlight.databasePathForJournal(journalPath);
  assert.match(databasePath, /journals\/[a-f\d]{64}\/ledger\.sqlite$/u);
  assert.equal(databasePath.startsWith(cacheDirectory), true);
  assert.equal(require.cache[sqliteModulePath], undefined);

  ledlight.ensureDatabaseCurrent(journalPath);
  assert.ok(require.cache[sqliteModulePath]);

  const journal = ledlight.openJournal(journalPath);
  const packageOperations = Object.entries(ledlight)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
  const journalOperations = Object.entries(journal)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
  assert.deepEqual(
    [...new Set([...packageOperations, ...journalOperations])].sort(),
    Object.keys(apiCommands).sort(),
    'every callable public API operation must have a CLI command',
  );
  assert.equal(journal.journalPath, fs.realpathSync.native(journalPath));
  assert.deepEqual(journal.accountBalances({ account: 'Assets:Cash' }), []);
  assert.deepEqual(journal.accountPostings({ account: 'Assets:Cash' }), []);
  assert.deepEqual(journal.aggregateReport(), []);
  assert.deepEqual(journal.balanceHistoryReport(), []);
  assert.deepEqual(journal.gainReport(), []);
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
