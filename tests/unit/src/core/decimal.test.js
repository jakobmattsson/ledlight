'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  divideDecimals,
  divideDecimalsHalfEven,
  formatDecimal,
  formatDecimalFixed,
  parseDecimal,
  registerDecimalFunctions,
} = resolveRepositoryModule("src/impl/core/decimal.js");

test('rounds exact decimal values to a fixed number of places', () => {
  assert.equal(formatDecimalFixed(parseDecimal('10'), 2), '10.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.004'), 2), '1.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.005'), 2), '1.01');
  assert.equal(formatDecimalFixed(parseDecimal('-1.005'), 2), '-1.01');
});

test('divides exact decimal values to a bounded scale', () => {
  assert.equal(formatDecimal(divideDecimals(parseDecimal('1000'), parseDecimal('10'), 10)), '100');
  assert.equal(
    formatDecimal(divideDecimals(parseDecimal('19999.98'), parseDecimal('48.34'), 10)),
    '413.7356226727',
  );
  assert.equal(formatDecimal(divideDecimals(parseDecimal('-1'), parseDecimal('3'), 2)), '-0.33');
  assert.throws(() => divideDecimals(parseDecimal('1'), parseDecimal('0'), 10), /divide by zero/u);
});

test('requires digits on both sides of a decimal point', () => {
  for (const value of ['.5', '-1.', '+.25', '+10.']) {
    assert.throws(() => parseDecimal(value), /Invalid decimal value/u);
  }
});

test('rounds exact division ties to even for Ledger price presentation', () => {
  for (const [numerator, expected] of [['1', '0.007812'], ['3', '0.023438'], ['-1', '-0.007812']]) {
    assert.equal(formatDecimal(divideDecimalsHalfEven(parseDecimal(numerator), parseDecimal('128'), 6)), expected);
  }
  assert.equal(formatDecimal(divideDecimals(parseDecimal('1'), parseDecimal('128'), 6)), '0.007813');
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
