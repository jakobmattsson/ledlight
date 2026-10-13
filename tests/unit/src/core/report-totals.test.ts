'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { appendTotal } = resolveRepositoryModule('src/modules/implementations/core/report-totals.js');

test('appends an exact total without mutating report rows', () => {
  const input = [
    { account: 'Assets:A', quantity: '0.1', commodity: 'SEK' },
    { account: 'Assets:B', quantity: '0.2', commodity: 'SEK' },
  ];
  assert.deepEqual(appendTotal(input), [
    ...input,
    { account: 'Total', quantity: '0.3', commodity: 'SEK', isTotal: true },
  ]);
  assert.equal(input.length, 2);
  assert.deepEqual(appendTotal([]), []);
});
