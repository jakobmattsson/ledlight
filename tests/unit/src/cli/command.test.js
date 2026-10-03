'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createCommand = require('../../../../src/cli/command');
const cliArguments = resolveRepositoryModule('src/cli/arguments.js');
const cliFormat = resolveRepositoryModule('src/cli/format.js');

test('delegates report behavior to the public Node API and only formats results', () => {
  const calls = [];
  const project = {
    aggregateReport(options) {
      calls.push({ operation: 'aggregateReport', options });
      return [
        { account: 'Assets:Cash', quantity: '-10', commodity: 'USD' },
        { account: 'Total', quantity: '-10', commodity: 'USD', isTotal: true },
      ];
    },
    balanceHistoryReport(options) {
      calls.push({ operation: 'balanceHistoryReport', options });
      return [{ date: '2024-01-01', amount: '-10', commodity: 'USD' }];
    },
    gainReport(options) {
      calls.push({ operation: 'gainReport', options });
      return [{ account: 'Assets:Broker', quantity: '12.5', commodity: 'USD' }];
    },
    investmentPerformance(options) {
      calls.push({ operation: 'investmentPerformance', options });
      return {
        from: null,
        to: null,
        commodities: [],
        valuationCommodity: 'USD',
        openingValue: 0,
        netContributions: 0,
        endingValue: 0,
        profitLoss: 0,
        timeWeightedReturn: null,
        moneyWeightedReturnTotal: null,
        moneyWeightedReturn: null,
      };
    },
    commodityDescriptions() {
      calls.push({ operation: 'commodityDescriptions' });
      return [{ commodity: 'USD', comment: null, format: '1,000.00 USD', isDefault: true }];
    },
  };
  const ledlight = {
    version: '1.2.3',
    openProject(startDirectory) {
      calls.push({ operation: 'openProject', startDirectory });
      return project;
    },
  };
  const { runReportCommand } = createCommand({ ledlight, cliArguments, cliFormat });

  assert.match(runReportCommand(['--help'], { startDirectory: '/project' }), /^Usage:/u);
  assert.equal(runReportCommand(['--version'], { startDirectory: '/project' }), '1.2.3\n');

  assert.match(
    runReportCommand(['aggregate', '--accounts', 'Assets:', '--value', '--invert'], {
      startDirectory: '/project',
    }),
    /Total.*-10\.00 USD/u,
  );
  assert.equal(
    runReportCommand(['balance-history', '--invert', '--csv'], { startDirectory: '/project' }),
    'date,amount\n2024-01-01,-10.00\n',
  );
  assert.match(
    runReportCommand(['investment-performance'], { startDirectory: '/project' }),
    /Opening value: 0\.00 USD/u,
  );
  assert.equal(
    runReportCommand(['gain', '--csv'], { startDirectory: '/project' }),
    'account,amount,commodity\nAssets:Broker,12.50,USD\n',
  );

  assert.deepEqual(calls, [
    { operation: 'openProject', startDirectory: '/project' },
    {
      operation: 'aggregateReport',
      options: {
        accounts: ['Assets:'],
        inValuationCommodity: true,
        invert: true,
        includeTotal: true,
      },
    },
    { operation: 'commodityDescriptions' },
    { operation: 'openProject', startDirectory: '/project' },
    {
      operation: 'balanceHistoryReport',
      options: {
        accounts: [],
        invert: true,
      },
    },
    { operation: 'openProject', startDirectory: '/project' },
    {
      operation: 'investmentPerformance',
      options: { accounts: [], commodities: [], excludeCommodities: [] },
    },
    { operation: 'commodityDescriptions' },
    { operation: 'openProject', startDirectory: '/project' },
    { operation: 'gainReport', options: { accounts: [] } },
  ]);
});

test('delegates non-report commands to every remaining public API operation', () => {
  const calls = [];
  const project = {
    projectRoot: '/project',
    rebuilt: false,
    accountTransactions(options) { calls.push(['accountTransactions', options]); return ['transactions']; },
    commodityDescriptions() { calls.push(['commodityDescriptions']); return ['commodities']; },
    ledgerAccounts() { calls.push(['ledgerAccounts']); return ['accounts']; },
    ledgerTransaction(options) { calls.push(['ledgerTransaction', options]); return { id: 7 }; },
    ledgerTransactions(options) { calls.push(['ledgerTransactions', options]); return { page: 2 }; },
    ledgerValuationRateResolver() {
      calls.push(['ledgerValuationRateResolver']);
      return (commodity, throughDate) => {
        calls.push(['resolveRate', commodity, throughDate]);
        return '10.5';
      };
    },
  };
  const ledlight = {
    version: '1.2.3',
    parse(...arguments_) { calls.push(['parse', ...arguments_]); return { entries: [] }; },
    loadJournal(...arguments_) { calls.push(['loadJournal', ...arguments_]); return { entries: [] }; },
    loadProjectPaths(directory) { calls.push(['loadProjectPaths', directory]); return { projectRoot: directory }; },
    ensureProjectDatabaseCurrent(directory) { calls.push(['ensureProjectDatabaseCurrent', directory]); return { rebuilt: true }; },
    accountBalances(options, directory) { calls.push(['accountBalances', options, directory]); return ['balances']; },
    accountPostings(options, directory) { calls.push(['accountPostings', options, directory]); return ['postings']; },
    openProject(directory) { calls.push(['openProject', directory]); return project; },
  };
  const { runReportCommand } = createCommand({ ledlight, cliArguments, cliFormat });
  const run = (arguments_) => JSON.parse(runReportCommand(arguments_, { startDirectory: '/cwd' }));

  assert.deepEqual(run(['parse', 'account Assets:Cash\n', '--source', 'input']), { entries: [] });
  assert.deepEqual(run(['load-journal', '/journal']), { entries: [] });
  assert.deepEqual(run(['project-paths', '--directory', '/other']), { projectRoot: '/other' });
  assert.deepEqual(run(['ensure-database']), { rebuilt: true });
  assert.deepEqual(run(['open-project']), { projectRoot: '/project', rebuilt: false });
  assert.deepEqual(run(['account-balances', '--account', 'Assets:Cash']), ['balances']);
  assert.deepEqual(run(['account-postings', '--account', 'Assets:Cash']), ['postings']);
  assert.deepEqual(run(['account-transactions', '--account', 'Assets:Cash']), ['transactions']);
  assert.deepEqual(run(['commodity-descriptions']), ['commodities']);
  assert.deepEqual(run(['ledger-accounts']), ['accounts']);
  assert.deepEqual(run(['ledger-transaction', '--transaction-id', '7']), { id: 7 });
  assert.deepEqual(run([
    'ledger-transactions', '--order', 'newest', '--page', '2', '--page-size', '10',
  ]), { page: 2 });
  assert.equal(run([
    'valuation-rate', '--commodity', 'EUR', '--through-date', '2024-12-31',
  ]), '10.5');

  assert.deepEqual(calls, [
    ['parse', 'account Assets:Cash\n', { source: 'input' }],
    ['loadJournal', '/journal'],
    ['loadProjectPaths', '/other'],
    ['ensureProjectDatabaseCurrent', '/cwd'],
    ['openProject', '/cwd'],
    ['accountBalances', { account: 'Assets:Cash' }, '/cwd'],
    ['accountPostings', { account: 'Assets:Cash' }, '/cwd'],
    ['openProject', '/cwd'], ['accountTransactions', { account: 'Assets:Cash' }],
    ['openProject', '/cwd'], ['commodityDescriptions'],
    ['openProject', '/cwd'], ['ledgerAccounts'],
    ['openProject', '/cwd'], ['ledgerTransaction', { transactionId: '7' }],
    ['openProject', '/cwd'], ['ledgerTransactions', { order: 'newest', page: '2', pageSize: '10' }],
    ['openProject', '/cwd'], ['ledgerValuationRateResolver'],
    ['resolveRate', 'EUR', '2024-12-31'],
  ]);
});
