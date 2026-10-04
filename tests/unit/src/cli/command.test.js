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
    /^Usage: ledlight account-balances[\s\S]*--account <pattern>/u,
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
    accounts() {
      calls.push(['accounts']);
      return [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }];
    },
    tags() { calls.push(['tags']); return [{ tag: 'Imported' }]; },
    commodities() { calls.push(['commodities']); return [{ commodity: 'USD' }]; },
    prices() {
      calls.push(['prices']);
      return [{
        date: '2024-01-01', baseCommodity: 'EUR', quoteQuantity: '1.1',
        quoteCommodity: 'USD', comment: null,
      }];
    },
    transactions(options) {
      calls.push(['transactions', options]);
      return {
        order: 'newest', page: 2, pageSize: 10, totalTransactions: 1, totalPages: 1,
        transactions: [{
          transactionId: 7,
          transactionDate: '2024-01-03',
          description: 'Shop',
          comment: null,
          notes: [],
          postings: [{
            postingDate: '2024-01-03', account: 'Assets:Cash', comment: null,
            amount: { quantity: '-5', commodity: 'SEK' },
            lotCost: null, cost: null, balanceAssignment: null, balanceAssertion: null,
            amounts: [{ quantity: '-5', commodity: 'SEK' }],
          }],
        }],
      };
    },
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
  assert.equal(runReportCommand(['accounts', '--file', '/journal']), 'Assets:Cash\n');
  assert.deepEqual(run([
    'accounts', '--file', '/journal', '--details', '--format', 'json',
  ]), [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }]);
  assert.equal(runReportCommand(['tags', '--file', '/journal']), 'Imported\n');
  assert.equal(runReportCommand(['commodities', '--file', '/journal']), 'USD\n');
  assert.deepEqual(run(['prices', '--file', '/journal', '--format', 'json']), [{
    date: '2024-01-01', baseCommodity: 'EUR', quoteQuantity: '1.1',
    quoteCommodity: 'USD', comment: null,
  }]);
  assert.deepEqual(run([
    'transactions', '--file', '/journal', '--account', 'Assets:Cash',
    '--id', '7', '--order', 'newest', '--page', '2', '--page-size', '10',
    '--format', 'json',
  ]), {
    order: 'newest', page: 2, pageSize: 10, totalTransactions: 1, totalPages: 1,
    transactions: [{
      transactionId: 7,
      transactionDate: '2024-01-03',
      description: 'Shop',
      comment: null,
      notes: [],
      postings: [{
        postingDate: '2024-01-03', account: 'Assets:Cash', comment: null,
        amount: { quantity: '-5', commodity: 'SEK' },
        lotCost: null, cost: null, balanceAssignment: null, balanceAssertion: null,
        amounts: [{ quantity: '-5', commodity: 'SEK' }],
      }],
    }],
  });
  assert.equal(
    runReportCommand(['transactions', '--file', '/journal']),
    '2024/01/03 Shop\n    Assets:Cash                               -5 SEK\n',
  );
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
    ['openJournal', '/journal'], ['accounts'],
    ['openJournal', '/journal'], ['accounts'],
    ['openJournal', '/journal'], ['tags'],
    ['openJournal', '/journal'], ['commodities'],
    ['openJournal', '/journal'], ['prices'],
    ['openJournal', '/journal'], ['transactions', {
      account: 'Assets:Cash', id: '7', order: 'newest', page: '2', pageSize: '10',
    }],
    ['openJournal', '/journal'], ['commodityDescriptions'], ['transactions', {}],
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
    accounts() {
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
    runReportCommandWithWarnings(['accounts', '--file', '/journal']),
    { output: '', warnings: [warning] },
  );
  assert.deepEqual(calls, ['warnings', 'query']);
});

test('--ledger never opens a journal and is available on every command', () => {
  const { runReportCommand } = createCommand({
    project: { openJournal: () => { throw new Error('must not open a journal'); } },
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });
  const commands = [
    ['accounts'],
    ['tags'],
    ['commodities'],
    ['prices'],
    ['account-balances', '--account', 'Assets:Cash'],
    ['account-postings', '--account', 'Assets:Cash'],
    ['account-transactions', '--account', 'Assets:Cash'],
    ['commodity-descriptions'],
    ['transactions'],
    ['print'],
    ['reconciliation-entries', '--account', 'Assets:Cash'],
    ['valuation-rate', '--commodity', 'USD'],
    ['aggregate'],
    ['balance-history'],
    ['gain'],
    ['investment-performance'],
  ];

  for (const arguments_ of commands) {
    const output = runReportCommand([...arguments_, '--file', '/journal', '--ledger']);
    if (['accounts', 'transactions', 'print'].includes(arguments_[0])) {
      assert.match(output, /^ledger --args-only --no-pager --file \/journal (?:accounts|print)\n$/u);
    } else {
      assert.equal(output, 'No ledger equivalent command exists\n');
    }
  }
});
