'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery } = require('../support/repository-container');
const { createRepositoryContainer } = require('../../src/composition');

const queryDirectory = path.resolve(__dirname, '../../src/modules/implementations/queries/list-definitions');

test('registers all queries as one immutable dependency', () => {
  const container = createRepositoryContainer(path.resolve(__dirname, '../../src/modules'));
  const queries = container.resolve('queries');

  assert.ok(Object.isFrozen(queries));
  assert.ok(Object.isFrozen(queries.definitions));
  assert.equal(queries.definitions.length, fs.readdirSync(queryDirectory)
    .filter((fileName: string) => fileName.endsWith('.js')).length);
  for (const registrationName of [
    'aggregateQuery',
    'totalHistoryQuery',
    'unrealizedGainsQuery',
    'investmentPerformanceQuery',
    'accountsQuery',
    'transactionsQuery',
  ]) {
    assert.throws(() => container.resolve(registrationName), /Unknown module/u);
  }
});

test('each query module is exposed through the query collection', () => {
  const queryFiles = fs.readdirSync(queryDirectory)
    .filter((fileName: string) => fileName.endsWith('.js'))
    .sort();

  for (const fileName of queryFiles) {
    const expectedName = fileName.replace(/\.js$/u, '')
      .replace(/-([a-z])/gu, (_match: any, letter: any) => letter.toUpperCase());
    const query = resolveQuery(expectedName);
    assert.deepEqual(Object.keys(query).sort(), ['execute', 'inputSchema', 'name']);
    assert.equal(query.name, expectedName);
    assert.equal(typeof query.inputSchema?.safeParse, 'function',
      `${fileName} must expose inputSchema`);
    assert.equal(typeof query.execute, 'function', `${fileName} must expose execute`);
    assert.equal(query.execute.length, 3,
      `${fileName} execute must accept database, options, and caches`);
    assert.ok(Object.isFrozen(query), `${fileName} must be immutable`);
  }
});
