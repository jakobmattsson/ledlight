'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { formatDecimalFixed, parseDecimal } = resolveRepositoryModule("src/ledlight/accounting/decimal.js");

test('rounds exact decimal values to a fixed number of places', () => {
  assert.equal(formatDecimalFixed(parseDecimal('10'), 2), '10.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.004'), 2), '1.00');
  assert.equal(formatDecimalFixed(parseDecimal('1.005'), 2), '1.01');
  assert.equal(formatDecimalFixed(parseDecimal('-1.005'), 2), '-1.01');
});

test('accepts every decimal form supported by the journal grammar', () => {
  assert.deepEqual(parseDecimal('.5'), { coefficient: 5n, scale: 1 });
  assert.deepEqual(parseDecimal('-1.'), { coefficient: -1n, scale: 0 });
  assert.deepEqual(parseDecimal('+.25'), { coefficient: 25n, scale: 2 });
  assert.deepEqual(parseDecimal('+10.'), { coefficient: 10n, scale: 0 });
});
