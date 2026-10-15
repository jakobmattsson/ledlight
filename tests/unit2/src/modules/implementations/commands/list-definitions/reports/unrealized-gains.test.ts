'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/reports/unrealized-gains.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

const rows = [
  { account: 'Assets:Cash,Main', quantity: '2.005', commodity: 'SEK' },
  { account: 'Assets:LongAccount', quantity: '10000', commodity: 'SEK' },
];
const rowsWithTotal = [
  ...rows,
  { account: 'Total', quantity: '10002.005', commodity: 'SEK', isTotal: true },
];

test('puts aligned gains before left-aligned accounts', () => {
  assert.equal(format(rowsWithTotal, { format: 'text' }),
    '     2.01 SEK  Assets:Cash,Main\n' +
    '10,000.00 SEK  Assets:LongAccount\n' +
    '-------------\n' +
    '10,002.01 SEK  Total\n');
  assert.equal(format([], { format: 'text' }), '');
});
