'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createCommand = require('../../../../src/cli/cli-command');
const cliArguments = resolveRepositoryModule('src/cli/cli-arguments.js');
const cliFormat = resolveRepositoryModule('src/cli/cli-format.js');

test('delegates report behavior to the public Node API and only formats results', () => {
  const calls = [];
  const journal = {
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
  const project = {
    openJournal(journalPath) {
      calls.push({ operation: 'openJournal', journalPath });
      return journal;
    },
  };
  const { runReportCommand } = createCommand({
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  const topLevelHelp = runReportCommand(['--help']);
  assert.match(topLevelHelp, /^Usage:/u);
  assert.doesNotMatch(topLevelHelp, /Usage: ledlight aggregate/u);
  assert.equal(runReportCommand([]), topLevelHelp);
  assert.match(
    runReportCommand(['account-balances', '--help']),
    /^Usage: ledlight account-balances[\s\S]*--account <name>/u,
  );
  assert.equal(runReportCommand(['--version']), '1.2.3\n');
  assert.throws(() => runReportCommand(['-V']), /unknown option '-V'/u);
  assert.throws(() => runReportCommand(['-h']), /unknown option '-h'/u);
  assert.throws(
    () => runReportCommand(['help']),
    /unknown command 'help'/u,
  );
  assert.throws(
    () => runReportCommand(['version']),
    /unknown command 'version'/u,
  );

  assert.match(
    runReportCommand([
      'aggregate', '--file', '/journal', '--accounts', 'Assets:', '--value', '--invert',
    ]),
    /Total.*-10\.00 USD/u,
  );
  assert.equal(
    runReportCommand(['balance-history', '--file', '/journal', '--invert', '--csv']),
    'date,amount\n2024-01-01,-10.00\n',
  );
  assert.match(
    runReportCommand(['investment-performance', '--file', '/journal']),
    /Opening value: 0\.00 USD/u,
  );
  assert.equal(
    runReportCommand(['gain', '--file', '/journal', '--csv']),
    'account,amount,commodity\nAssets:Broker,12.50,USD\n',
  );

  assert.deepEqual(calls, [
    { operation: 'openJournal', journalPath: '/journal' },
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
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'balanceHistoryReport',
      options: {
        accounts: [],
        invert: true,
      },
    },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'investmentPerformance',
      options: { accounts: [], commodities: [], excludeCommodities: [] },
    },
    { operation: 'commodityDescriptions' },
    { operation: 'openJournal', journalPath: '/journal' },
    { operation: 'gainReport', options: { accounts: [] } },
  ]);
});

test('delegates non-report commands to the corresponding journal operations', () => {
  const calls = [];
  const journal = {
    accountBalances(options) { calls.push(['accountBalances', options]); return ['balances']; },
    accountPostings(options) { calls.push(['accountPostings', options]); return ['postings']; },
    accountTransactions(options) { calls.push(['accountTransactions', options]); return ['transactions']; },
    commodityDescriptions() { calls.push(['commodityDescriptions']); return ['commodities']; },
    ledgerAccounts() { calls.push(['ledgerAccounts']); return ['accounts']; },
    ledgerTransaction(options) { calls.push(['ledgerTransaction', options]); return { id: 7 }; },
    ledgerTransactions(options) { calls.push(['ledgerTransactions', options]); return { page: 2 }; },
    reconciliationEntries(options) { calls.push(['reconciliationEntries', options]); return ['entries']; },
    ledgerValuationRateResolver() {
      calls.push(['ledgerValuationRateResolver']);
      return (commodity, throughDate) => {
        calls.push(['resolveRate', commodity, throughDate]);
        return '10.5';
      };
    },
  };
  const project = {
    openJournal(journalPath) { calls.push(['openJournal', journalPath]); return journal; },
  };
  const { runReportCommand } = createCommand({
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });
  const run = (arguments_) => JSON.parse(runReportCommand(arguments_));

  assert.deepEqual(run(['account-balances', '--file', '/journal', '--account', 'Assets:Cash']), ['balances']);
  assert.deepEqual(run(['account-postings', '--file', '/journal', '--account', 'Assets:Cash']), ['postings']);
  assert.deepEqual(run(['account-transactions', '--file', '/journal', '--account', 'Assets:Cash']), ['transactions']);
  assert.deepEqual(run(['commodity-descriptions', '--file', '/journal']), ['commodities']);
  assert.deepEqual(run(['ledger-accounts', '--file', '/journal']), ['accounts']);
  assert.deepEqual(run(['ledger-transaction', '--file', '/journal', '--transaction-id', '7']), { id: 7 });
  assert.deepEqual(run([
    'ledger-transactions', '--file', '/journal', '--order', 'newest', '--page', '2', '--page-size', '10',
  ]), { page: 2 });
  assert.deepEqual(run([
    'reconciliation-entries', '--file', '/journal', '--account', 'Assets:Cash', '--related',
  ]), ['entries']);
  assert.equal(run([
    'valuation-rate', '--file', '/journal', '--commodity', 'EUR', '--through-date', '2024-12-31',
  ]), '10.5');

  assert.deepEqual(calls, [
    ['openJournal', '/journal'], ['accountBalances', { account: 'Assets:Cash' }],
    ['openJournal', '/journal'], ['accountPostings', { account: 'Assets:Cash' }],
    ['openJournal', '/journal'], ['accountTransactions', { account: 'Assets:Cash' }],
    ['openJournal', '/journal'], ['commodityDescriptions'],
    ['openJournal', '/journal'], ['ledgerAccounts'],
    ['openJournal', '/journal'], ['ledgerTransaction', { transactionId: '7' }],
    ['openJournal', '/journal'], ['ledgerTransactions', { order: 'newest', page: '2', pageSize: '10' }],
    ['openJournal', '/journal'], ['reconciliationEntries', { accounts: ['Assets:Cash'], related: true }],
    ['openJournal', '/journal'], ['ledgerValuationRateResolver'],
    ['resolveRate', 'EUR', '2024-12-31'],
  ]);
});

test('collects ingestion warnings before invoking a query', () => {
  const calls = [];
  const warning = Object.freeze({ code: 'EXAMPLE', message: 'Example warning' });
  const journal = {
    get warnings() {
      calls.push('warnings');
      return [warning];
    },
    ledgerAccounts() {
      calls.push('query');
      return [];
    },
  };
  const { runReportCommandWithWarnings } = createCommand({
    project: { openJournal: () => journal },
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  assert.deepEqual(
    runReportCommandWithWarnings(['ledger-accounts', '--file', '/journal']),
    { output: '[]\n', warnings: [warning] },
  );
  assert.deepEqual(calls, ['warnings', 'query']);
});
