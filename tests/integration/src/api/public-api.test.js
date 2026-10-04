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
  assert.deepEqual(journal.accountPostings({ accounts: ['Assets:Cash'] }), []);
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
      source: journal.warnings[0].instances[0].source,
      startLine: journal.warnings[0].instances[0].startLine,
      endLine: journal.warnings[0].instances[0].endLine,
    },
    { source: fs.realpathSync.native(journalPath), startLine: 5, endLine: 7 },
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

  const cli = spawnSync(process.execPath, [
    cliPath, 'balance', '--file', journalPath, '--accounts', 'Assets:', '--format', 'json',
  ], { cwd: directory, encoding: 'utf8', env: process.env });
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(cli.stdout), [
    { account: 'Assets:Cash', quantity: '10', commodity: 'SEK' },
  ]);
  assert.match(cli.stderr, /^\[SYNTAX_ERROR\] /u);
  assert.match(cli.stderr, new RegExp(
    `${journalPath.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:5:1 ` +
    '\\(affected lines 5-7\\)',
    'u',
  ));
  assert.match(cli.stderr, /\n\[BALANCE_ASSERTION_FAILED\] /u);
  assert.match(cli.stderr, /\n\[UNBALANCED_TRANSACTION\] /u);
  assert.doesNotMatch(cli.stderr, /^\s*\{/u);
});

test('groups repeated warnings and exposes only their first ten instances', (t) => {
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-grouped-warnings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const prices = Array.from({ length: 12 }, (_value, index) =>
    `P 2024-01-${String(index + 1).padStart(2, '0')} FUND 1 SEK`);
  fs.writeFileSync(journalPath, ['commodity SEK', '  default', ...prices, ''].join('\n'));

  const journal = ledlight.openJournal(journalPath);
  assert.equal(journal.warnings.length, 1);
  assert.equal(journal.warnings[0].code, 'UNDECLARED_COMMODITY');
  assert.equal(journal.warnings[0].message, 'Commodity FUND must be declared before use');
  assert.equal(journal.warnings[0].instances.length, 10);
  assert.deepEqual(journal.warnings[0].instances.map(({ line }) => line), [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);

  const cli = spawnSync(process.execPath, [cliPath, 'accounts', '--file', journalPath], {
    cwd: directory,
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(cli.status, 0);
  assert.equal(cli.stdout, '');
  assert.equal(cli.stderr.match(/^ {2}.*journal\.ledger:\d+:\d+$/gmu)?.length, 10);
  assert.match(cli.stderr, /\[UNDECLARED_COMMODITY\] Commodity FUND must be declared before use/u);
});
