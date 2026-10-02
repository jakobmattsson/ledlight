'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const packageMetadata = require('../../../../package.json');
const sqliteModulePath = require.resolve('better-sqlite3');
const ledlightPath = path.resolve(__dirname, '../../../..');
const cliPath = path.join(ledlightPath, 'src/ledlight/cli/run.js');

test('exposes the supported public API without eagerly loading SQLite', () => {
  delete require.cache[sqliteModulePath];

  const ledlight = require(ledlightPath);
  assert.deepEqual(Object.keys(ledlight).sort(), [
    'LedgerSyntaxError',
    'accountBalances',
    'accountPostings',
    'aggregateReport',
    'balanceHistoryReport',
    'ensureProjectDatabaseCurrent',
    'investmentPerformance',
    'loadJournal',
    'loadProjectPaths',
    'openProject',
    'parse',
    'version',
  ]);
  assert.equal(ledlight.version, packageMetadata.version);
  assert.equal(require.cache[sqliteModulePath], undefined);

  const document = ledlight.parse('account Assets:Cash\n', { source: '<input>' });
  assert.equal(document.entries[0].name, 'Assets:Cash');
  assert.equal(require.cache[sqliteModulePath], undefined);
});

test('prints CLI help and the public package version without opening a project', () => {
  assert.match(execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' }), /^Usage:/u);
  assert.equal(
    execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }),
    `${packageMetadata.version}\n`,
  );
});

test('loads SQLite only when a project database operation needs it', (t) => {
  delete require.cache[sqliteModulePath];
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-public-api-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(
    path.join(directory, 'journal.ledger'),
    'commodity SEK\n  default\naccount Assets:Cash\n',
  );

  const paths = ledlight.loadProjectPaths(directory);
  assert.match(paths.databasePath, /tmp\/ledger\.sqlite$/u);
  assert.equal(require.cache[sqliteModulePath], undefined);

  ledlight.ensureProjectDatabaseCurrent(directory);
  assert.ok(require.cache[sqliteModulePath]);

  const project = ledlight.openProject(directory);
  assert.equal(project.projectRoot, directory);
  assert.deepEqual(project.accountBalances({ account: 'Assets:Cash' }), []);
  assert.deepEqual(project.accountPostings({ account: 'Assets:Cash' }), []);
  assert.deepEqual(project.aggregateReport(), []);
  assert.deepEqual(project.balanceHistoryReport(), []);
  assert.deepEqual(project.investmentPerformance(), {
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
