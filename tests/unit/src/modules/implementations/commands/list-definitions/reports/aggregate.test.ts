'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/reports/aggregate.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

test('aligns aggregate amounts and formats commodity CSV rows', () => {
  assert.equal(
    format([
      { quantity: '1234.5', commodity: 'SEK' },
      { quantity: '2', commodity: 'FUND' },
    ], { format: 'text', denominate: false, groupBy: 'commodity' },
    [{ commodity: 'SEK', format: '1,000.00 SEK' }]),
    '1,234.50 SEK\n    2    FUND\n',
  );
  assert.equal(
    format([{ quantity: '1234.5', commodity: 'SEK' }],
      { format: 'csv', denominate: false, groupBy: 'commodity' }),
    'amount,commodity\n1234.5,SEK\n',
  );
});
