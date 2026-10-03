'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  accountPrefixFilter,
} = resolveRepositoryModule("src/queries/support/account-prefix-filter.js");
const { prefixUpperBound } = resolveRepositoryModule(
  "src/queries/support/account-prefix-filter.js",
).$$private;

test('calculates exclusive Unicode prefix bounds', () => {
  assert.equal(prefixUpperBound('Assets:'), 'Assets;');
  assert.equal(prefixUpperBound('Övrigt'), 'Övrigu');
  assert.equal(prefixUpperBound(`A${String.fromCodePoint(0x10FFFF)}`), 'B');
  assert.equal(prefixUpperBound(String.fromCodePoint(0x10FFFF)), undefined);
});

test('builds parameterized indexable account ranges', () => {
  assert.deepEqual(accountPrefixFilter('p.account', ['Assets:', 'Liabilities:']), {
    sql: '((p.account >= ? AND p.account < ?) OR (p.account >= ? AND p.account < ?))',
    parameters: ['Assets:', 'Assets;', 'Liabilities:', 'Liabilities;'],
  });

  const highestCodePoint = String.fromCodePoint(0x10FFFF);
  assert.deepEqual(accountPrefixFilter('p.account', [highestCodePoint]), {
    sql: '(p.account >= ?)',
    parameters: [highestCodePoint],
  });
});
