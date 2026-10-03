'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const { queryAccountBalances } = resolveRepositoryModule('src/queries/account-balances.js');

test('executes against the supplied database dependency', () => {
  const expected = [{ commodity: 'SEK', quantity: '10' }];
  let statement;
  const database = {
    prepare(sql) {
      statement = sql;
      return {
        all(...parameters) {
          assert.deepEqual(parameters, ['Assets:Cash', '2024-12-31']);
          return expected;
        },
      };
    },
  };

  assert.equal(queryAccountBalances(database, {
    account: 'Assets:Cash',
    to: '2024-12-31',
  }), expected);
  assert.match(statement, /WHERE p\.account = \? AND p\.report_date <= \?/u);
});
