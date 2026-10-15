'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/raw/tags.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

test('formats tags as text, JSON, and CSV', () => {
  const tags = [{ tag: 'Imported' }, { tag: 'Reviewed, manually' }];
  assert.equal(format(tags, { format: 'text' }), 'Imported\nReviewed, manually\n');
  assert.equal(format(tags, { format: 'json' }), `${JSON.stringify([
    'Imported', 'Reviewed, manually',
  ], null, 2)}\n`);
  assert.equal(format(tags, { format: 'csv' }), 'tag\nImported\n"Reviewed, manually"\n');
});
