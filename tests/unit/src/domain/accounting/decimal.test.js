'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { formatDecimalFixed, parseDecimal } = resolveRepositoryModule("src/domain/accounting/decimal.js");

test('rounds exact decimal values to a fixed number of places', () => {
  assert.equal(formatDecimalFixed(parseDecimal('10'), 2), '10.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.004'), 2), '1.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.005'), 2), '1.01');
  assert.equal(formatDecimalFixed(parseDecimal('-1.005'), 2), '-1.01');
});

test('requires digits on both sides of a decimal point', () => {
  for (const value of ['.5', '-1.', '+.25', '+10.']) {
    assert.throws(() => parseDecimal(value), /Invalid decimal value/u);
  }
});
