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
    () => journal.aggregate({ unknown: true }),
    (error) => error.code === 'LEDLIGHT_INVALID_API_INPUT',
  );
  assert.throws(
    () => journal.aggregate({ inValuationCommodity: true }),
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
  }]);
  assert.equal(journal.warnings[0].instances[0].line, 19);
  assert.deepEqual(openJournal(journalPath).warnings, journal.warnings);
  const Database = require(sqliteModulePath);
  const previousCache = new Database(journal.databasePath);
  try {
    previousCache.prepare("UPDATE database_metadata SET value = '22' WHERE key = 'schema_version'").run();
    previousCache.prepare('DELETE FROM ingestion_warnings').run();
  } finally {
    previousCache.close();
  }
  const rebuilt = openJournal(journalPath);
  assert.equal(rebuilt.rebuilt, true);
  assert.deepEqual(rebuilt.warnings, journal.warnings);
  assert.deepEqual(journal.aggregate({ inValuationCommodity: true, includeTotal: true }).at(-1), {
    account: 'Total', commodity: 'SEK', isTotal: true, quantity: '10',
  });
  assert.deepEqual(journal.balanceHistoryReport(), [
    { date: '2024-01-01', amount: '10', commodity: 'SEK' },
  ]);
  assert.deepEqual(journal.unrealizedGains(), []);
  for (const command of ['aggregate', 'balance-history', 'unrealized-gains', 'accounts']) {
    const result = spawnSync(process.execPath, [
      cliPath, command, '--format', 'json', '--file', journalPath,
    ], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, LEDLIGHT_CACHE_HOME: cacheDirectory },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(Array.isArray(JSON.parse(result.stdout)));
    if (command === 'unrealized-gains') assert.deepEqual(JSON.parse(result.stdout), []);
    assert.equal(result.stderr.split('\n')[0], `[FOREIGN_LOT_COST_CURRENCY] ${message}`);
  }

  fs.writeFileSync(journalPath, fs.readFileSync(journalPath, 'utf8').replace(
    '1 STOCK {10 USD}\n  Assets:USD\n',
    '1 STOCK {20 SEK}\n  Assets:USD  -10 USD {2 SEK} @ 2 SEK\n',
  ));
  const correctedJournal = openJournal(journalPath);
  assert.deepEqual(correctedJournal.warnings, []);
  assert.deepEqual(correctedJournal.unrealizedGains(), [
    { account: 'Assets:Stock', quantity: '10', commodity: 'SEK' },
  ]);
  assert.equal(correctedJournal.aggregate({
    inValuationCommodity: true, includeTotal: true,
  }).at(-1).quantity, '10');
  assert.equal(correctedJournal.balanceHistoryReport().at(-1).amount, '10');
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
  assert.deepEqual(journal.postings(), []);
  assert.deepEqual(journal.aggregate(), []);
  assert.deepEqual(journal.balanceHistoryReport(), []);
  assert.deepEqual(journal.unrealizedGains(), []);
  assert.equal(Object.hasOwn(journal, 'reconciliationEntries'), false);
  assert.deepEqual(journal.commodities(), [{
    commodity: 'SEK',
    comment: null,
    format: null,
    isDefault: true,
    used: false,
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
  assert.deepEqual(journal.aggregate({ accounts: ['Assets:'] }), [
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

  const cli = spawnSync(process.execPath, [
    cliPath, 'aggregate', '--file', journalPath, '--accounts', 'Assets:', '--format', 'json',
  ], { cwd: directory, encoding: 'utf8', env: process.env });
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(cli.stdout), [
    { account: 'Assets:Cash', quantity: '10', commodity: 'SEK' },
  ]);
  assert.match(cli.stderr, /^\[SYNTAX_ERROR\] /u);
  assert.match(cli.stderr, new RegExp(
    `${journalPath.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:6:1 ` +
    '\\(affected lines 6-8\\)',
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
  fs.writeFileSync(journalPath, [
    'commodity SEK', '  format 1,000.00 SEK', '  default', ...prices, '',
  ].join('\n'));

  const journal = ledlight.openJournal(journalPath);
  assert.equal(journal.warnings.length, 1);
  assert.equal(journal.warnings[0].code, 'UNDECLARED_COMMODITY');
  assert.equal(journal.warnings[0].message, 'Commodity FUND must be declared before use');
  assert.equal(journal.warnings[0].instances.length, 10);
  assert.deepEqual(journal.warnings[0].instances.map(({ line }) => line), [
    4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
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
  for (const command of ['balance-history', 'unrealized-gains', 'aggregate', 'accounts']) {
    const arguments_ = [cliPath, command, '--file', journalPath, '--format', 'json'];
    if (command !== 'accounts') arguments_.push('--to', '2024-01-01', '--accounts', '^Assets:Bank$');
    const cli = spawnSync(process.execPath, arguments_, {
      cwd: directory, encoding: 'utf8', env: process.env,
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stderr, /\[RESIDUAL_COST_BASIS\] Assets:Broker: zero FUND units retain cost basis 1000 USD/u);
  }
});
