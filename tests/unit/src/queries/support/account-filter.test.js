'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { accountFilter, accountMatches } = resolveRepositoryModule(
  "src/impl/query-support/account-filter.js",
);
const { prefixUpperBound } = resolveRepositoryModule(
  "src/impl/query-support/account-filter.js",
).$$private;

test('calculates exclusive Unicode prefix bounds', () => {
  assert.equal(prefixUpperBound('Assets:'), 'Assets;');
  assert.equal(prefixUpperBound('Övrigt'), 'Övrigu');
  assert.equal(prefixUpperBound(`A${String.fromCodePoint(0x10FFFF)}`), 'B');
  assert.equal(prefixUpperBound(String.fromCodePoint(0x10FFFF)), undefined);
});

test('matches exact names by default and uses stars for open matching', () => {
  const names = [
    'EUR', 'EUR:Cash', 'Fund:EUR', 'Fund:EUR:Old', 'Cash', 'Assets:^Cash$',
    'A?B[C', 'AxxB[C', 'Assets:%', 'Eur', '',
  ];
  const database = new Database(':memory:');
  try {
    database.exec('CREATE TABLE accounts (name TEXT NOT NULL)');
    const insert = database.prepare('INSERT INTO accounts (name) VALUES (?)');
    for (const name of names) insert.run(name);
    const selections = [
      ['EUR'], ['EUR*'], ['*EUR'], ['*EUR*'], ['*EUR*Old'],
      ['Fund:*:Old'], ['A*B[C'], ['A?B[C'], ['Assets:^Cash$'],
      ['Assets:%'], [''], ['*'], ['~EUR'], ['EUR*', '~*Old'],
      ['*EUR*', '~Fund:*'], ['~*'], ['^EUR$'],
    ];
    for (const patterns of selections) {
      const expected = names.filter((name) => accountMatches(name, patterns));
      const filter = accountFilter('name', patterns);
      const actual = database.prepare(`SELECT name FROM accounts WHERE ${filter.sql}`)
        .all(...filter.parameters).map(({ name }) => name);
      assert.deepEqual(actual, expected, patterns.join(', '));
    }
  } finally {
    database.close();
  }
});

test('combines inclusion with exclusions and preserves prefix bounds', () => {
  assert.deepEqual(accountFilter('p.account', ['Jakob:*', '~Jakob:Tillgångar*']), {
    sql: '(((p.account >= ? AND p.account < ?)) AND NOT ((p.account >= ? AND p.account < ?)))',
    parameters: ['Jakob:', 'Jakob;', 'Jakob:Tillgångar', 'Jakob:Tillgångas'],
  });
  assert.equal(accountMatches('Jakob:Cash', ['Jakob:*', '~Jakob:Tillgångar*']), true);
  assert.equal(accountMatches('Jakob:Tillgångar:Cash', ['Jakob:*', '~Jakob:Tillgångar*']), false);
  assert.equal(accountMatches('Other:Cash', ['~EUR']), true);
  assert.equal(accountMatches('Anything', []), true);
});
