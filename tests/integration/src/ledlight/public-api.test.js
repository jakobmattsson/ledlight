'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sqliteModulePath = require.resolve('better-sqlite3');
const ledlightPath = path.resolve(__dirname, '../../../..');

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
    'runReportCommand',
  ]);
  assert.equal(require.cache[sqliteModulePath], undefined);

  const document = ledlight.parse('account Assets:Cash\n', { source: '<input>' });
  assert.equal(document.entries[0].name, 'Assets:Cash');
  assert.equal(require.cache[sqliteModulePath], undefined);
});

test('loads SQLite only when a project database operation needs it', (t) => {
  delete require.cache[sqliteModulePath];
  const ledlight = require(ledlightPath);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-public-api-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(path.join(directory, 'journal.ledger'), 'D 1,000.00 SEK\naccount Assets:Cash\n');

  const paths = ledlight.loadProjectPaths(directory);
  assert.match(paths.databasePath, /tmp\/ledger\.sqlite$/u);
  assert.equal(require.cache[sqliteModulePath], undefined);

  ledlight.ensureProjectDatabaseCurrent(directory);
  assert.ok(require.cache[sqliteModulePath]);

  const project = ledlight.openProject(directory);
  assert.equal(project.projectRoot, directory);
  assert.deepEqual(project.accountBalances({ account: 'Assets:Cash' }), []);
  assert.deepEqual(project.accountPostings({ account: 'Assets:Cash' }), []);
  assert.deepEqual(project.aggregateReport({}), []);
  assert.deepEqual(project.balanceHistoryReport({}), []);
  assert.deepEqual(project.investmentPerformance({}), {
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
  assert.equal(ledlight.runReportCommand(['aggregate', '--csv'], {
    project, startDirectory: undefined,
  }),
  'account,amount,commodity\n');
  assert.equal(ledlight.runReportCommand(['balance-history', '--csv'], {
    project, startDirectory: undefined,
  }),
  'date,amount\n');
  assert.equal(ledlight.runReportCommand([
    'investment-performance',
    '--accounts', 'Assets:',
    '--exclude-commodities', 'SEK',
  ], { project, startDirectory: undefined }),
  'Investment performance from n/a to n/a\n' +
  'Instruments: 0\n' +
  'Opening value: 0.00 SEK\n' +
  'Net contributions: 0.00 SEK\n' +
  'Ending value: 0.00 SEK\n' +
  'Profit/loss: 0.00 SEK\n' +
  'Time-weighted return: n/a\n' +
  'Money-weighted return (total): n/a\n' +
  'Money-weighted return (annualized): n/a\n');
  assert.throws(() => ledlight.runReportCommand(['unknown'], {
    project, startDirectory: undefined,
  }), /Usage:/u);
});
