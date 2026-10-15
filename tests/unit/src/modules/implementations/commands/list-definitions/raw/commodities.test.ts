'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/raw/commodities.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

test('formats commodities as text, JSON, and CSV', () => {
  const commodities = [{
    commodity: 'SEK', comment: 'Swedish krona', format: '1,000.00 SEK',
    isDefault: true, used: true,
  }, {
    commodity: 'US, Dollar', comment: null, format: null,
    isDefault: false, used: false,
  }];
  assert.equal(format(commodities, { details: false, format: 'text' }), 'SEK\nUS, Dollar\n');
  assert.equal(format(commodities, { details: false, format: 'csv' }),
    'commodity\nSEK\n"US, Dollar"\n');
  assert.equal(format([], { details: false, format: 'text' }), '');
  assert.equal(format(commodities, { details: true, format: 'json' }),
    `${JSON.stringify(commodities, null, 2)}\n`);
  assert.equal(format(commodities, { details: true, format: 'csv' }),
    'commodity,comment,format,isDefault,used\n' +
    'SEK,Swedish krona,"1,000.00 SEK",true,true\n' +
    '"US, Dollar",,,false,false\n');
  assert.equal(format(commodities, { details: true, format: 'text' }),
    'Commodity   Default  Used  Format        Comment\n' +
    '----------  -------  ----  ------------  -------------\n' +
    'SEK         yes      yes   1,000.00 SEK  Swedish krona\n' +
    'US, Dollar\n');
});
