'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatDecimalFixed,
  parseDecimal,
  registerDecimalFunctions,
} = resolveRepositoryModule("src/core/decimal.js");

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

test('retains parsed decimal state until a database sum completes', () => {
  let aggregate;
  const database = {
    aggregate(name, options) {
      if (name === 'decimal_sum') aggregate = options;
    },
    function() {},
  };
  registerDecimalFunctions(database);

  let total = aggregate.start();
  total = aggregate.step(total, '1.25');
  total = aggregate.step(total, null);
  total = aggregate.step(total, '2.5');

  assert.deepEqual(total, { coefficient: 375n, scale: 2 });
  assert.equal(aggregate.result(total), '3.75');
  assert.equal(aggregate.result(aggregate.start()), '0');
});
