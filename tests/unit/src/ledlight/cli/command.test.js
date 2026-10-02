'use strict';

const { resolveRepositoryModule } = require('../../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const createCommand = require('../../../../../src/ledlight/cli/command');
const cliArguments = resolveRepositoryModule('src/ledlight/cli/arguments.js');
const cliFormat = resolveRepositoryModule('src/ledlight/cli/format.js');

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
  ]);
});
