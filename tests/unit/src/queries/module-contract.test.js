'use strict';

const { createRepositoryContainer } = require('../../../../src/impl/composition/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');

test('registers all queries as one immutable dependency', () => {
  const container = createRepositoryContainer();
  const queries = container.resolve('queries');

  assert.ok(Object.isFrozen(queries));
  assert.equal(queries.length, 11);
  for (const registrationName of [
    'aggregateQuery',
    'totalHistoryQuery',
    'unrealizedGainsQuery',
    'investmentPerformanceQuery',
    'accountsQuery',
    'transactionsQuery',
  ]) {
    assert.equal(container.hasRegistration(registrationName), false);
  }
});
