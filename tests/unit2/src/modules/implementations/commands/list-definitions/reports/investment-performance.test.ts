'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/reports/investment-performance.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

const formatInvestmentPerformanceCsv = (report: unknown) => format(report, { format: 'csv' });

test('writes one investment performance CSV row with nested API fields', () => {
  const report = {
    from: null,
    to: null,
    commodities: ['FUND,A'],
    valuationCommodity: 'USD',
    openingValue: 0,
    endingValue: 10,
    netContributions: 10,
    profitLoss: 0,
    timeWeightedReturn: null,
    timeWeightedReturnAnnualized: null,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
    points: [{ date: '2024-01-01', value: 10 }],
  };
  assert.equal(formatInvestmentPerformanceCsv(report),
    'from,to,commodities,valuationCommodity,openingValue,endingValue,netContributions,' +
    'profitLoss,timeWeightedReturn,timeWeightedReturnAnnualized,moneyWeightedReturn,' +
    'moneyWeightedReturnTotal,points\n' +
    ',,"[""FUND,A""]",USD,0,10,10,0,,,,,"[{""date"":""2024-01-01"",""value"":10}]"\n');
});
