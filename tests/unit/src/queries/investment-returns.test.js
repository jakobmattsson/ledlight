'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { xirr } = resolveRepositoryModule('src/impl/query-support/investment-returns.js').$$private;

test('calculates annualized XIRR from dated cash flows', () => {
  const result = xirr([
    { date: '2023-01-01', amount: -100 },
    { date: '2024-01-01', amount: 110 },
  ]);

  assert.ok(Math.abs(result - 0.1) < 1e-10);
});
