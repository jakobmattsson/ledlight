'use strict';

const {
  createRepositoryContainer,
  $$private: { assertDependencyAllowed, commandGroup, repositoryModuleName },
} = require('../../src/impl/composition/repository-container');

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

test('derives dependency names from unique kebab-case filenames', () => {
  assert.equal(repositoryModuleName('/example/database-reader.js'), 'databaseReader');
  assert.throws(
    () => repositoryModuleName('/example/database_reader.js'),
    /must use lowercase kebab-case/u,
  );
});

test('requires command files directly inside a single group directory', () => {
  assert.equal(commandGroup(path.join('reports', 'total-history.js')), 'reports');
  assert.throws(
    () => commandGroup(path.join('reports', 'nested', 'total-history.js')),
    /directly inside one group directory/u,
  );
  assert.throws(
    () => commandGroup('total-history.js'),
    /directly inside one group directory/u,
  );
});

test('prevents dependencies on CLI modules from outside the CLI', () => {
  assert.throws(
    () => assertDependencyAllowed('src/impl/core/example.js', 'cliCommand'),
    /may not depend on CLI module/u,
  );
  assert.doesNotThrow(
    () => assertDependencyAllowed('src/impl/cli/example.js', 'cliCommand'),
  );
  assert.doesNotThrow(
    () => assertDependencyAllowed('src/surface/commands/raw/example.js', 'cliCommand'),
  );
  assert.throws(
    () => assertDependencyAllowed('src/surface/queries/example.js', 'cliCommand'),
    /may not depend on CLI module/u,
  );
});

test('prevents ingestion from depending on queries', () => {
  assert.throws(
    () => assertDependencyAllowed('src/impl/ingestion/example.js', 'queries'),
    /may not depend on query module/u,
  );
  assert.throws(
    () => assertDependencyAllowed('src/impl/ingestion/example.js', 'valuationRates'),
    /may not depend on query module/u,
  );
});

test('all repository registrations can be resolved within the dependency boundaries', () => {
  const container = createRepositoryContainer();
  for (const name of Object.keys(container.registrations)) {
    assert.doesNotThrow(() => container.resolve(name), `Could not resolve ${name}`);
  }
});

test('repository container uses controlled values and shares resolved factories', () => {
  const container = createRepositoryContainer();
  const workingDirectory = () => '/test-journal';
  container.register({ currentWorkingDirectory: workingDirectory });

  assert.equal(container.resolve('currentWorkingDirectory'), workingDirectory);
  assert.equal(container.resolve('project'), container.resolve('project'));
});
