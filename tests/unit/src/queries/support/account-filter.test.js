'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  accountFilter,
} = resolveRepositoryModule("src/impl/query-support/account-filter.js");
const { prefixUpperBound } = resolveRepositoryModule(
  "src/impl/query-support/account-filter.js",
).$$private;

test('calculates exclusive Unicode prefix bounds', () => {
  assert.equal(prefixUpperBound('Assets:'), 'Assets;');
  assert.equal(prefixUpperBound('Övrigt'), 'Övrigu');
  assert.equal(prefixUpperBound(`A${String.fromCodePoint(0x10FFFF)}`), 'B');
  assert.equal(prefixUpperBound(String.fromCodePoint(0x10FFFF)), undefined);
});

test('builds literal substring filters with optional start and end anchors', () => {
  assert.deepEqual(accountFilter('p.account', ['^Assets:', 'Cash$', '^Equity:Opening$']), {
    sql: '((p.account >= ? AND p.account < ?) OR substr(p.account, -length(?)) = ? OR p.account = ?)',
    parameters: ['Assets:', 'Assets;', 'Cash', 'Cash', 'Equity:Opening'],
  });

  const highestCodePoint = String.fromCodePoint(0x10FFFF);
  assert.deepEqual(accountFilter('p.account', [`^${highestCodePoint}`]), {
    sql: '(p.account >= ?)',
    parameters: [highestCodePoint],
  });
  assert.deepEqual(accountFilter('p.account', ['Assets']), {
    sql: '(instr(p.account, ?) > 0)',
    parameters: ['Assets'],
  });
});
