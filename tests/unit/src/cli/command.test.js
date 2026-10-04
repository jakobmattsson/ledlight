'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createCommand = require('../../../../src/cli/cli-command');
const cliArguments = resolveRepositoryModule('src/cli/cli-arguments.js');
const cliFormat = resolveRepositoryModule('src/cli/cli-format.js');

const commandNames = [...new Set([...Object.values(cliArguments.apiCommands), 'print'])];

test('shows identical command help with or without the explicit help option', () => {
  const { runReportCommand } = createCommand({
    project: { openJournal: () => { throw new Error('must not open a journal'); } },
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  for (const command of commandNames) {
    assert.equal(runReportCommand([command]), runReportCommand([command, '--help']));
  }
});

test('delegates report behavior to the public Node API and only formats results', () => {
  const calls = [];
  const journal = {
    aggregateReport(options) {
      calls.push({ operation: 'aggregateReport', options });
      if (options.groupBy === 'commodity') {
        return [{ quantity: '-10', commodity: 'USD' }];
      }
      return [
        { account: 'Assets:Cash', quantity: '-10', commodity: 'USD' },
        { account: 'Total', quantity: '-10', commodity: 'USD', isTotal: true },
      ];
    },
    balanceHistoryReport(options) {
      calls.push({ operation: 'balanceHistoryReport', options });
      return [{ date: '2024-01-01', amount: '-10', commodity: 'USD' }];
    },
    unrealizedGains(options) {
      calls.push({ operation: 'unrealizedGains', options });
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
    runReportCommand(['balance', '--help']),
    /^Usage: ledlight balance[\s\S]*--accounts <pattern>/u,
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
      'balance', '--file', '/journal', '--accounts', 'Assets:', '--value', '--invert',
    ]),
    /-10\.00 USD.*Total/u,
  );
  assert.equal(
    runReportCommand([
      'balance', '--file', '/journal', '--accounts', 'Assets:',
      '--group-by', 'commodity', '--format', 'csv',
    ]),
    'amount,commodity\n-10,USD\n',
  );
  assert.equal(
    runReportCommand(['balance-history', '--file', '/journal', '--invert', '--format', 'csv']),
    'date,amount\n2024-01-01,-10.00\n',
  );
  assert.match(
    runReportCommand(['investment-performance', '--file', '/journal']),
    /Opening value: 0\.00 USD/u,
  );
  assert.equal(
    runReportCommand([
      'unrealized-gains', '--file', '/journal', '--format', 'csv', '--total',
    ]),
    'account,amount,commodity\nAssets:Broker,12.50,USD\nTotal,12.50,USD\n',
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
      operation: 'aggregateReport',
      options: { accounts: ['Assets:'], groupBy: 'commodity', includeTotal: false },
    },
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
    { operation: 'unrealizedGains', options: { accounts: [] } },
  ]);
});

test('delegates non-report commands to the corresponding journal operations', () => {
  const calls = [];
  const journal = {
    accountPostings(options) { calls.push(['accountPostings', options]); return ['postings']; },
    accountTransactions(options) { calls.push(['accountTransactions', options]); return ['transactions']; },
    commodityDescriptions() {
      calls.push(['commodityDescriptions']);
      return [{ commodity: 'SEK', comment: null, format: '1,000.00 SEK' }];
    },
    accounts(options) {
      calls.push(['accounts', options]);
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

  assert.deepEqual(run(['account-postings', '--file', '/journal', '--accounts', 'Assets:Cash']), ['postings']);
  assert.deepEqual(run(['account-transactions', '--file', '/journal', '--accounts', 'Assets:Cash']), ['transactions']);
  assert.deepEqual(run(['commodity-descriptions', '--file', '/journal']), [
    { commodity: 'SEK', comment: null, format: '1,000.00 SEK' },
  ]);
  assert.equal(runReportCommand(['accounts', '--file', '/journal']), 'Assets:Cash\n');
  assert.deepEqual(run([
    'accounts', '--file', '/journal', '--accounts', 'Assets:Cash', '--details', '--format', 'json',
  ]), [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }]);
  assert.equal(runReportCommand(['tags', '--file', '/journal']), 'Imported\n');
  assert.equal(runReportCommand(['commodities', '--file', '/journal']), 'USD\n');
  assert.deepEqual(run(['prices', '--file', '/journal', '--format', 'json']), [{
    date: '2024-01-01', baseCommodity: 'EUR', quoteQuantity: '1.1',
    quoteCommodity: 'USD', comment: null,
  }]);
  assert.deepEqual(run([
    'transactions', '--file', '/journal', '--accounts', 'Assets:Cash',
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
    '2024/01/03 Shop\n    Assets:Cash                            -5.00 SEK\n',
  );
  assert.deepEqual(run([
    'reconciliation-entries', '--file', '/journal', '--account', 'Assets:Cash', '--related',
  ]), ['entries']);
  assert.deepEqual(calls, [
    ['openJournal', '/journal'], ['accountPostings', { accounts: ['Assets:Cash'] }],
    ['openJournal', '/journal'], ['accountTransactions', { accounts: ['Assets:Cash'] }],
    ['openJournal', '/journal'], ['commodityDescriptions'],
    ['openJournal', '/journal'], ['accounts', { accounts: [] }],
    ['openJournal', '/journal'], ['accounts', { accounts: ['Assets:Cash'] }],
    ['openJournal', '/journal'], ['tags'],
    ['openJournal', '/journal'], ['commodities'],
    ['openJournal', '/journal'], ['prices'],
    ['openJournal', '/journal'], ['transactions', {
      accounts: ['Assets:Cash'], id: '7', order: 'newest', page: '2', pageSize: '10',
    }],
    ['openJournal', '/journal'], ['commodityDescriptions'], ['transactions', { accounts: [] }],
    ['openJournal', '/journal'], ['reconciliationEntries', { accounts: ['Assets:Cash'], related: true }],
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
    accounts(_options) {
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
    ['balance'],
    ['account-postings', '--accounts', 'Assets:Cash'],
    ['account-transactions', '--accounts', 'Assets:Cash'],
    ['commodity-descriptions'],
    ['transactions'],
    ['print'],
    ['reconciliation-entries', '--account', 'Assets:Cash'],
    ['balance-history'],
    ['unrealized-gains'],
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
