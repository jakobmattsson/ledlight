'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveTestModule } = require('../../../../../support/repository-container');

function configuration(read: () => { journalPath?: string }) {
  return resolveTestModule('src/modules/implementations/cli/cli-configuration.js', {
    internals: { core: { configuration: { read } } },
  });
}

test('supplies the configured journal as --file after the command', () => {
  const module = configuration(() => ({ journalPath: '/books/main.ledger' }));

  assert.deepEqual(module.apply(['aggregate', '--format', 'csv']), [
    'aggregate', '--file', '/books/main.ledger', '--format', 'csv',
  ]);
});

test('keeps an explicit --file option instead of reading configuration', () => {
  const module = configuration(() => assert.fail('explicit file must bypass configuration'));

  assert.deepEqual(module.apply(['aggregate', '--file', 'explicit.ledger']),
    ['aggregate', '--file', 'explicit.ledger']);
});

test('leaves arguments unchanged when no journal is configured', () => {
  const module = configuration(() => ({}));
  assert.deepEqual(module.apply(['aggregate']), ['aggregate']);
  assert.deepEqual(module.apply([]), []);
});
