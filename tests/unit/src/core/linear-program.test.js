'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');
const { maximize } = resolveRepositoryModule('src/impl/core/linear-program.js');
const { parse, format } = resolveRepositoryModule('src/impl/core/rational.js');
const coefficients = (values) => new Map(values.map((value, index) => [index, parse(value)]));
const constraint = (values, bound) => ({ coefficients: coefficients(values), bound: parse(bound) });

test('solves fractional optima without rounding even above the safe integer range', () => {
  const result = maximize(2, [
    constraint(['3', '0'], '1'),
    constraint(['0', '1'], '9007199254740993.01'),
  ], coefficients(['1', '1']));
  assert.equal(result.status, 'optimal');
  assert.equal(format(result.solution[0]), '1/3');
  assert.equal(format(result.solution[1]), '9007199254740993.01');
  assert.equal(format(result.value), '2702159776422298003/300');
});

test('distinguishes infeasible and unbounded programs', () => {
  assert.equal(maximize(1, [
    constraint(['1'], '1'), constraint(['-1'], '-2'),
  ], coefficients(['1'])).status, 'infeasible');
  assert.equal(maximize(1, [constraint(['-1'], '-2')], coefficients(['1'])).status, 'unbounded');
});

test('handles degenerate pivots and redundant constraints without cycling', () => {
  const result = maximize(4, [
    constraint(['0.5', '-5.5', '-2.5', '9'], '0'),
    constraint(['0.5', '-1.5', '-0.5', '1'], '0'),
    constraint(['1', '0', '0', '0'], '1'),
    constraint(['0', '0', '0', '0'], '0'),
  ], coefficients(['10', '-57', '-9', '-24']));
  assert.equal(result.status, 'optimal');
  assert.equal(format(result.value), '1');
});

test('retains exact equality constraints through the feasibility phase', () => {
  const result = maximize(2, [
    constraint(['1', '1'], '3'), constraint(['-1', '-1'], '-3'),
    constraint(['1', '-1'], '1'), constraint(['-1', '1'], '-1'),
    constraint(['2', '2'], '6'), constraint(['-2', '-2'], '-6'),
  ], coefficients(['2', '3']));
  assert.equal(result.status, 'optimal');
  assert.deepEqual(result.solution.map(format), ['2', '1']);
  assert.equal(format(result.value), '7');
});
