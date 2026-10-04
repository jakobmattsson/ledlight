'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const { groupWarnings } = resolveRepositoryModule('src/ingestion/ingestion-warning.js');

function warning(code, message, line) {
  return {
    code,
    message,
    source: '/journal.ledger',
    line,
    column: 5,
    startLine: line,
    endLine: line,
  };
}

test('groups matching warnings and retains at most ten instances', () => {
  const warnings = [
    ...Array.from({ length: 12 }, (_value, index) =>
      warning('UNDECLARED_COMMODITY', 'Commodity FUND must be declared before use', index + 1)),
    warning('UNDECLARED_COMMODITY', 'Commodity USD must be declared before use', 20),
    warning('UNDECLARED_ACCOUNT', 'Account Assets:Cash must be declared before use', 21),
  ];

  const groups = groupWarnings(warnings);

  assert.deepEqual(groups, [{
    code: 'UNDECLARED_COMMODITY',
    message: 'Commodity FUND must be declared before use',
    instances: Array.from({ length: 10 }, (_value, index) => ({
      source: '/journal.ledger',
      line: index + 1,
      column: 5,
      startLine: index + 1,
      endLine: index + 1,
    })),
  }, {
    code: 'UNDECLARED_COMMODITY',
    message: 'Commodity USD must be declared before use',
    instances: [{
      source: '/journal.ledger',
      line: 20,
      column: 5,
      startLine: 20,
      endLine: 20,
    }],
  }, {
    code: 'UNDECLARED_ACCOUNT',
    message: 'Account Assets:Cash must be declared before use',
    instances: [{
      source: '/journal.ledger',
      line: 21,
      column: 5,
      startLine: 21,
      endLine: 21,
    }],
  }]);
  assert.equal(Object.isFrozen(groups), true);
  assert.equal(Object.isFrozen(groups[0]), true);
  assert.equal(Object.isFrozen(groups[0].instances), true);
  assert.equal(Object.isFrozen(groups[0].instances[0]), true);
});
