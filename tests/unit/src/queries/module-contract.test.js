'use strict';

const { resolveQuery } = require('../../../support/repository-container');
const { createRepositoryContainer } = require('../../../../src/composition/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const queryDirectory = path.resolve(__dirname, '../../../../src/queries');

test('registers all queries as one immutable dependency', () => {
  const container = createRepositoryContainer();
  const queries = container.resolve('queries');

  assert.ok(Object.isFrozen(queries));
  assert.equal(queries.length, 10);
  for (const registrationName of [
    'summaryQuery',
    'balanceHistoryQuery',
    'unrealizedGainsQuery',
    'investmentPerformanceQuery',
    'accountsQuery',
    'transactionsQuery',
  ]) {
    assert.equal(container.hasRegistration(registrationName), false);
  }
});

test('each query module is exposed through the query collection', () => {
  const queryFiles = fs.readdirSync(queryDirectory)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort();

  for (const fileName of queryFiles) {
    const expectedName = {
      'summary.js': 'summary',
      'balance-history.js': 'balanceHistoryReport',
      'unrealized-gains.js': 'unrealizedGains',
    }[fileName] ?? fileName.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase())
      .replace(/\.js$/u, '');
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
