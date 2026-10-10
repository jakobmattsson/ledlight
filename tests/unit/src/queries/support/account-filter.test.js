'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  accountFilter,
  accountMatches,
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

test('includes any positive match and excludes every negative match', () => {
  const patterns = ['^Jakob:', 'Savings$', '~^Jakob:Tillgångar', '~foobar', '~baz$'];
  for (const account of ['Jakob:Cash', 'Other:Savings']) {
    assert.equal(accountMatches(account, patterns), true);
  }
  for (const account of [
    'Jakob:Tillgångar:Cash', 'Jakob:foobar', 'Jakob:baz', 'Other:Cash',
  ]) {
    assert.equal(accountMatches(account, patterns), false);
  }
  assert.equal(accountMatches('Other:Cash', ['~foobar']), true);
  assert.equal(accountMatches('Other:foobar', ['~foobar']), false);
  assert.equal(accountMatches('Anything', []), true);
  assert.equal(accountMatches('Anything', ['~']), false);

  assert.deepEqual(accountFilter('p.account', patterns), {
    sql: '(((p.account >= ? AND p.account < ?) OR substr(p.account, -length(?)) = ?) AND NOT ((p.account >= ? AND p.account < ?)) AND NOT (instr(p.account, ?) > 0) AND NOT (substr(p.account, -length(?)) = ?))',
    parameters: ['Jakob:', 'Jakob;', 'Savings', 'Savings', 'Jakob:Tillgångar', 'Jakob:Tillgångas', 'foobar', 'baz', 'baz'],
  });
  assert.deepEqual(accountFilter('p.account', ['~foobar']), {
    sql: '(NOT (instr(p.account, ?) > 0))', parameters: ['foobar'],
  });
});
