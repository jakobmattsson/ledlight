'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createCommand = require('../../../../src/cli/cli-command');
const createArguments = require('../../../../src/cli/cli-arguments');
const cliArguments = resolveRepositoryModule('src/cli/cli-arguments.js');
const cliFormat = resolveRepositoryModule('src/cli/cli-format.js');
const coreProject = resolveRepositoryModule('src/core/project.js');

const commandNames = [...new Set(Object.values(cliArguments.apiCommands))];

test('shows command help only with the explicit help option', () => {
  const { runReportCommand } = createCommand({
    project: { openJournal: () => { throw new Error('must not open a journal'); } },
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  for (const command of commandNames) {
    assert.equal(runReportCommand([command, '--help']), `${cliArguments.usage(command)}\n`);
  }
});

test('runs a bare command when CLI configuration supplies the journal path', () => {
  const configuredArguments = createArguments({
    cliConfiguration: {
      apply: (arguments_) => [arguments_[0], '--file', '/configured-journal'],
    },
    project: coreProject,
  });
  const opened = [];
  const project = {
    openJournal(journalPath) {
      opened.push(journalPath);
      return {
        warnings: [],
        investmentPerformance: () => ({
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
        }),
        commodities: () => [],
      };
    },
  };
  const { runReportCommand } = createCommand({
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments: configuredArguments,
    cliFormat,
  });

  assert.match(runReportCommand(['investment-performance']), /Opening value: 0\.00 USD/u);
  assert.deepEqual(opened, ['/configured-journal']);
});

test('delegates report behavior to the public Node API and only formats results', () => {
  const calls = [];
  const journal = {
    summary(options) {
      calls.push({ operation: 'summary', options });
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
    commodities(options) {
      calls.push({ operation: 'commodities', options });
      return [{
        commodity: 'USD', comment: null, format: '1,000.00 USD',
        isDefault: true, used: true,
      }];
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
    runReportCommand(['summary', '--help']),
    /^Usage: ledlight summary[\s\S]*--accounts <pattern>/u,
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
      'summary', '--file', '/journal', '--accounts', 'Assets:', '--value', '--invert',
    ]),
    /-10\.00 USD.*Total/u,
  );
  assert.equal(
    runReportCommand([
      'summary', '--file', '/journal', '--accounts', 'Assets:',
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
      operation: 'summary',
      options: {
        accounts: ['Assets:'],
        dateBasis: 'posting',
        groupBy: 'account',
        inValuationCommodity: true,
        invert: true,
        includeTotal: true,
      },
    },
    { operation: 'commodities', options: { usage: 'all' } },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'summary',
      options: {
        accounts: ['Assets:'], dateBasis: 'posting', groupBy: 'commodity', includeTotal: false,
      },
    },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'balanceHistoryReport',
      options: {
        accounts: [],
        dateBasis: 'posting',
        invert: true,
      },
    },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'investmentPerformance',
      options: { accounts: [], commodities: [], excludeCommodities: [] },
    },
    { operation: 'commodities', options: { usage: 'all' } },
    { operation: 'openJournal', journalPath: '/journal' },
    { operation: 'unrealizedGains', options: { accounts: [], dateBasis: 'posting' } },
  ]);
});

test('delegates non-report commands to the corresponding journal operations', () => {
  const calls = [];
  const journal = {
    accounts(options) {
      calls.push(['accounts', options]);
      return [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }];
    },
    tags(options) { calls.push(['tags', options]); return [{ tag: 'Imported' }]; },
    commodities(options) {
      calls.push(['commodities', options]);
      const usd = {
        commodity: 'USD', comment: null, format: '1,000.00 USD',
        isDefault: true, used: true,
      };
      if (options.usage === 'used') return [usd];
      return [{
        commodity: 'SEK', comment: null, format: '1,000.00 SEK',
        isDefault: false, used: false,
      }, usd];
    },
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

  assert.equal(runReportCommand(['accounts', '--file', '/journal']), 'Assets:Cash\n');
  assert.deepEqual(run([
    'accounts', '--file', '/journal', '--accounts', 'Assets:Cash', '--details', '--format', 'json',
  ]), [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }]);
  assert.equal(runReportCommand(['tags', '--file', '/journal']), 'Imported\n');
  assert.equal(runReportCommand(['commodities', '--file', '/journal']), 'USD\n');
  assert.deepEqual(run([
    'commodities', '--file', '/journal', '--usage', 'all', '--details', '--format', 'json',
  ]), [{
    commodity: 'SEK', comment: null, format: '1,000.00 SEK',
    isDefault: false, used: false,
  }, {
    commodity: 'USD', comment: null, format: '1,000.00 USD',
    isDefault: true, used: true,
  }]);
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
    '2024-01-03 Shop\n    Assets:Cash                            -5.00 SEK\n',
  );
  assert.deepEqual(run([
    'reconciliation-entries', '--file', '/journal', '--accounts', 'Assets:Cash', '--related',
  ]), ['entries']);
  assert.deepEqual(calls, [
    ['openJournal', '/journal'], ['accounts', { accounts: [], usage: 'used' }],
    ['openJournal', '/journal'], ['accounts', {
      accounts: ['Assets:Cash'], usage: 'used',
    }],
    ['openJournal', '/journal'], ['tags', { usage: 'used' }],
    ['openJournal', '/journal'], ['commodities', { usage: 'used' }],
    ['openJournal', '/journal'], ['commodities', { usage: 'all' }],
    ['openJournal', '/journal'], ['prices'],
    ['openJournal', '/journal'], ['transactions', {
      accounts: ['Assets:Cash'], id: '7', order: 'newest', page: '2', pageSize: '10',
    }],
    ['openJournal', '/journal'], ['commodities', { usage: 'all' }],
    ['transactions', { accounts: [], order: 'oldest' }],
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

test('formats the postings API result in the requested CLI format', () => {
  const calls = [];
  const postings = [{
    postingId: 2,
    transactionId: 1,
    transactionDate: '2024-01-01',
    description: 'Opening',
    transactionComment: null,
    transactionNotes: [],
    postingDate: '2024-01-02',
    account: 'Assets:Cash',
    postingComment: null,
    amount: { quantity: '10', commodity: 'SEK' },
    lotCost: null,
    cost: null,
    balanceAssignment: null,
    balanceAssertion: null,
    amounts: [{ quantity: '10', commodity: 'SEK' }],
  }];
  const project = {
    openJournal(journalPath) {
      calls.push(['openJournal', journalPath]);
      return {
        warnings: [],
        postings(options) {
          calls.push(['postings', options]);
          return postings;
        },
      };
    },
  };
  const { runReportCommand } = createCommand({
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  assert.deepEqual(JSON.parse(runReportCommand([
    'postings', '--file', '/journal', '--from', '2024-01-01',
    '--to', '2024-01-31', '--accounts', 'Assets:', '--format', 'json',
  ])), postings);
  assert.deepEqual(calls, [
    ['openJournal', '/journal'],
    ['postings', { from: '2024-01-01', to: '2024-01-31', accounts: ['Assets:'] }],
  ]);
});
