'use strict';

import type { AggregateRow } from '../../../../src/public-api';

const { resolveCommands, resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const withExternal = require('../../../support/external-dependencies.js');
const test = require('node:test');
const commander = require('commander');
const createCommand = withExternal(require('../../../../src/modules/cli/internal/cli-command'), ['packageMetadata']);
const createArguments = withExternal(require('../../../../src/modules/cli/internal/cli-arguments'), ['commander']);
const commands = resolveCommands();
const cliArguments = resolveRepositoryModule('src/modules/cli/internal/cli-arguments.js');
const cliFormat = resolveRepositoryModule('src/modules/cli/internal/cli-format.js');
const coreProject = resolveRepositoryModule('src/modules/project/internal/project.js');

const commandNames = [...new Set(Object.values(cliArguments.apiCommands))];

test('shows command help only with the explicit help option', () => {
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
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
    commander,
    commands: { definitions: commands },
    cliConfiguration: {
      apply: (arguments_: string[]) => [arguments_[0], '--file', '/configured-journal'],
    },
    project: coreProject,
  });
  const opened: string[] = [];
  const project = {
    openJournal(journalPath: string) {
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
          timeWeightedReturnAnnualized: null,
          moneyWeightedReturnTotal: null,
          moneyWeightedReturn: null,
        }),
        commodities: () => [],
      };
    },
  };
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments: configuredArguments,
    cliFormat,
  });

  assert.match(runReportCommand(['investment-performance']), /Opening value: 0\.00 USD/u);
  assert.deepEqual(opened, ['/configured-journal']);
});

test('prepares selected output before shared JSON encoding', () => {
  const account = { account: 'Assets:Cash', comment: 'Cash', transactionCount: 1 };
  const gain = { account: 'Assets:Broker', quantity: '5', commodity: 'USD' };
  const project = {
    openJournal: () => ({
      warnings: [],
      accounts: () => [account],
      unrealizedGains: () => [gain],
    }),
  };
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });
  assert.equal(runReportCommand(['accounts', '--file', '/journal', '--format', 'json']),
    '[\n  "Assets:Cash"\n]\n');
  assert.equal(runReportCommand(['accounts', '--file', '/journal', '--details', '--format', 'json']),
    `${JSON.stringify([account], null, 2)}\n`);
  assert.equal(runReportCommand([
    'unrealized-gains', '--file', '/journal', '--include-total', '--format', 'json',
  ]), `${JSON.stringify([gain, {
    account: 'Total', commodity: 'USD', isTotal: true, quantity: '5',
  }], null, 2)}\n`);
});

test('delegates report behavior to the public Node API and only formats results', () => {
  const calls: unknown[] = [];
  const journal = {
    aggregate(options: Record<string, unknown>) {
      calls.push({ operation: 'aggregate', options });
      if (options.groupBy === 'commodity') {
        return [{ quantity: '-10', commodity: 'USD' }];
      }
      return [
        { account: 'Assets:Cash', quantity: '-10', commodity: 'USD' },
        { account: 'Total', quantity: '-10', commodity: 'USD', isTotal: true },
      ];
    },
    totalHistory(options: Record<string, unknown>) {
      calls.push({ operation: 'totalHistory', options });
      return [{ date: '2024-01-01', amount: '-10', commodity: 'USD' }];
    },
    unrealizedGains(options: Record<string, unknown>) {
      calls.push({ operation: 'unrealizedGains', options });
      return [{ account: 'Assets:Broker', quantity: '12.5', commodity: 'USD' }];
    },
    investmentPerformance(options: Record<string, unknown>) {
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
        timeWeightedReturnAnnualized: null,
        moneyWeightedReturnTotal: null,
        moneyWeightedReturn: null,
      };
    },
    commodities(options: Record<string, unknown>) {
      calls.push({ operation: 'commodities', options });
      return [{
        commodity: 'USD', comment: null, format: '1,000.00 USD',
        isDefault: true, used: true,
      }];
    },
  };
  const project = {
    openJournal(journalPath: string) {
      calls.push({ operation: 'openJournal', journalPath });
      return journal;
    },
  };
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
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
    runReportCommand(['aggregate', '--help']),
    /^Usage: ledlight aggregate[\s\S]*--accounts <pattern>/u,
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
      'aggregate', '--file', '/journal', '--accounts', 'Assets:', '--denominate', '--invert',
      '--include-total',
    ]),
    /-{20}\n\s+-10\.00 USD\n$/u,
  );
  assert.equal(
    runReportCommand([
      'aggregate', '--file', '/journal', '--accounts', 'Assets:',
      '--group-by', 'commodity', '--format', 'csv',
    ]),
    'amount,commodity\n-10,USD\n',
  );
  assert.equal(
    runReportCommand(['total-history', '--file', '/journal', '--invert', '--format', 'csv']),
    'date,amount\n2024-01-01,-10.00\n',
  );
  assert.match(
    runReportCommand(['investment-performance', '--file', '/journal']),
    /Opening value: 0\.00 USD/u,
  );
  assert.equal(
    runReportCommand([
      'unrealized-gains', '--file', '/journal', '--format', 'csv', '--include-total',
    ]),
    'account,amount,commodity\nAssets:Broker,12.50,USD\nTotal,12.50,USD\n',
  );

  assert.deepEqual(calls, [
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'aggregate',
      options: {
        accounts: ['Assets:'],
        dateBasis: 'posting', valuation: 'market',
        groupBy: 'account',
        denominate: true,
        invert: true,
        includeTotal: true,
      },
    },
    { operation: 'commodities', options: { usage: 'all' } },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'aggregate',
      options: {
        accounts: ['Assets:'], dateBasis: 'posting', valuation: 'market', groupBy: 'commodity',
      },
    },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'totalHistory',
      options: {
        dateBasis: 'posting', valuation: 'market',
        invert: true,
      },
    },
    { operation: 'openJournal', journalPath: '/journal' },
    {
      operation: 'investmentPerformance',
      options: {},
    },
    { operation: 'commodities', options: { usage: 'all' } },
    { operation: 'openJournal', journalPath: '/journal' },
    { operation: 'unrealizedGains', options: { dateBasis: 'posting' } },
  ]);
});

test('aggregate includes a total only when requested in every output format', () => {
  const calls: Array<{ includeTotal?: boolean }> = [];
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
    project: {
      openJournal: () => ({
        aggregate(options: Record<string, unknown>) {
          calls.push(options);
          const rows: AggregateRow[] = [{ account: 'Assets:Cash', quantity: '10', commodity: 'USD' }];
          if (options.includeTotal) {
            rows.push({ account: 'Total', quantity: '10', commodity: 'USD', isTotal: true });
          }
          return rows;
        },
        commodities: () => [],
      }),
    },
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });

  for (const format of ['text', 'csv', 'json']) {
    const arguments_ = ['aggregate', '--file', '/journal', '--denominate', '--format', format];
    const output = runReportCommand(arguments_);
    assert.match(output, /Assets:Cash/u);
    assert.doesNotMatch(output, /Total/u);
    assert.equal(calls.at(-1)?.includeTotal, undefined);

    const outputWithTotal = runReportCommand([...arguments_, '--include-total']);
    assert.match(outputWithTotal, /Assets:Cash/u);
    if (format === 'text') assert.match(outputWithTotal, /-{20}\n\s+10\.00 USD\n$/u);
    else assert.match(outputWithTotal, /Total/u);
    assert.equal(calls.at(-1)?.includeTotal, true);
  }
});

test('delegates non-report commands to the corresponding journal operations', () => {
  const calls: unknown[] = [];
  const journal = {
    accounts(options: Record<string, unknown>) {
      calls.push(['accounts', options]);
      return [{ account: 'Assets:Cash', comment: 'Daily use', transactionCount: 2 }];
    },
    tags(options: Record<string, unknown>) { calls.push(['tags', options]); return [{ tag: 'Imported' }]; },
    commodities(options: Record<string, unknown>) {
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
    prices(options: Record<string, unknown>) {
      calls.push(['prices', options]);
      return [{
        date: '2024-01-01', baseCommodity: 'EUR', quoteQuantity: '1.1',
        quoteCommodity: 'USD', comment: null,
      }];
    },
    transactions(options: Record<string, unknown>) {
      calls.push(['transactions', options]);
      return {
        order: 'newest', page: 2, pageSize: 10, totalTransactions: 1, totalPages: 1,
        transactions: [{
          transactionId: 7,
          transactionDate: '2024-01-03',
          description: 'Shop',
          comments: [],
          postings: [{
            postingDate: '2024-01-03', account: 'Assets:Cash', comments: [],
            amount: { quantity: '-5', commodity: 'SEK' },
            lotCost: null, cost: null, balanceAssignment: null, balanceAssertion: null,
            amounts: [{ quantity: '-5', commodity: 'SEK' }],
          }],
        }],
      };
    },
  };
  const project = {
    openJournal(journalPath: string) { calls.push(['openJournal', journalPath]); return journal; },
  };
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
    project,
    packageMetadata: { version: '1.2.3' },
    cliArguments,
    cliFormat,
  });
  const run = (arguments_: string[]) => JSON.parse(runReportCommand(arguments_));

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
      comments: [],
      postings: [{
        postingDate: '2024-01-03', account: 'Assets:Cash', comments: [],
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
  assert.deepEqual(calls, [
    ['openJournal', '/journal'], ['accounts', { usage: 'used' }],
    ['openJournal', '/journal'], ['accounts', {
      accounts: ['Assets:Cash'], usage: 'used',
    }],
    ['openJournal', '/journal'], ['tags', { usage: 'used' }],
    ['openJournal', '/journal'], ['commodities', { usage: 'used' }],
    ['openJournal', '/journal'], ['commodities', { usage: 'all' }],
    ['openJournal', '/journal'], ['prices', { mode: 'effective' }],
    ['openJournal', '/journal'], ['transactions', {
      accounts: ['Assets:Cash'], id: '7', order: 'newest', page: '2', pageSize: '10',
    }],
    ['openJournal', '/journal'], ['transactions', { order: 'oldest' }],
    ['commodities', { usage: 'all' }],
  ]);
});

test('collects ingestion warnings before invoking a query', () => {
  const calls: unknown[] = [];
  const warning = Object.freeze({ code: 'EXAMPLE', message: 'Example warning' });
  const journal = {
    get warnings() {
      calls.push('warnings');
      return [warning];
    },
    accounts(_options: Record<string, unknown>) {
      calls.push('query');
      return [];
    },
  };
  const { runReportCommandWithWarnings } = createCommand({
    commands: { definitions: commands },
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
  const calls: unknown[] = [];
  const postings = [{
    postingId: 2,
    transactionId: 1,
    transactionDate: '2024-01-01',
    description: 'Opening',
    transactionComments: [],
    postingDate: '2024-01-02',
    account: 'Assets:Cash',
    postingComments: [],
    amount: { quantity: '10', commodity: 'SEK' },
    lotCost: null,
    cost: null,
    balanceAssignment: null,
    balanceAssertion: null,
    amounts: [{ quantity: '10', commodity: 'SEK' }],
  }];
  const project = {
    openJournal(journalPath: string) {
      calls.push(['openJournal', journalPath]);
      return {
        warnings: [],
        postings(options: Record<string, unknown>) {
          calls.push(['postings', options]);
          return postings;
        },
      };
    },
  };
  const { runReportCommand } = createCommand({
    commands: { definitions: commands },
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
