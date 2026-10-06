'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseApi } = require('../../../support/cli-case');

test('parses a journal method call with JSON-like JavaScript literals', () => {
  assert.deepEqual(parseApi("aggregate({ from: '2024-02-29', accounts: ['Assets:'], " +
    "invert: false, count: -2, details: { note: null } })"), {
    method: 'aggregate',
    args: [{
      from: '2024-02-29',
      accounts: ['Assets:'],
      invert: false,
      count: -2,
      details: { note: null },
    }],
  });
});

test('rejects expressions in API case arguments', () => {
  for (const statement of [
    "unrealizedGains({ to: new Date('2024-02-29') })",
    'aggregate({ to: Date.now() })',
    'aggregate({ from: date })',
    'aggregate({ accounts: [...patterns] })',
    'aggregate({ includeTotal: true || false })',
    'aggregate({ ...options })',
    'journal.aggregate({})',
    'aggregate({}); accounts({})',
    'aggregate({});',
  ]) {
    assert.throws(() => parseApi(statement), /API/u, statement);
  }
});
