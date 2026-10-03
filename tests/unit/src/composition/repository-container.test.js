'use strict';

const {
  createRepositoryContainer,
  $$private: { assertDependencyAllowed },
} = require('../../../../src/composition/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');

test('prevents dependencies on CLI modules from outside the CLI', () => {
  assert.throws(
    () => assertDependencyAllowed('src/application/example.js', 'cliCommand'),
    /may not depend on CLI module/u,
  );
  assert.doesNotThrow(
    () => assertDependencyAllowed('src/cli/example.js', 'cliCommand'),
  );
});

test('prevents ingestion from depending on queries', () => {
  assert.throws(
    () => assertDependencyAllowed('src/ingestion/example.js', 'queries'),
    /may not depend on query module/u,
  );
  assert.throws(
    () => assertDependencyAllowed('src/ingestion/example.js', 'valuationRates'),
    /may not depend on query module/u,
  );
});

test('all repository registrations can be resolved within the dependency boundaries', () => {
  const container = createRepositoryContainer();
  for (const name of Object.keys(container.registrations)) {
    assert.doesNotThrow(() => container.resolve(name), `Could not resolve ${name}`);
  }
});
