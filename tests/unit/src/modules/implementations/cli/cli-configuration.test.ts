'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const createConfiguration = require('../../../../../../src/modules/implementations/cli/cli-configuration');

test('supplies the configured journal as --file after the command', () => {
  const configuration = createConfiguration({
    core: { readConfiguration: () => ({ journalPath: '/books/main.ledger' }) },
  });

  assert.deepEqual(configuration.apply(['aggregate', '--format', 'csv']), [
    'aggregate', '--file', '/books/main.ledger', '--format', 'csv',
  ]);
});

test('keeps an explicit --file option instead of reading configuration', () => {
  const configuration = createConfiguration({
    core: { readConfiguration: () => assert.fail('explicit file must bypass configuration') },
  });

  assert.deepEqual(configuration.apply(['aggregate', '--file', 'explicit.ledger']),
    ['aggregate', '--file', 'explicit.ledger']);
});

test('leaves arguments unchanged when no journal is configured', () => {
  const configuration = createConfiguration({
    core: { readConfiguration: () => ({}) },
  });
  assert.deepEqual(configuration.apply(['aggregate']), ['aggregate']);
  assert.deepEqual(configuration.apply([]), []);
});
