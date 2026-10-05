'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { AllocationHistory } = resolveRepositoryModule('src/ingestion/accounting/allocation-history.js');
const { parse, format } = resolveRepositoryModule('src/core/rational.js');

function ambiguousHistory(account, cheapCost, expensiveCost, saleCost) {
  const history = new AllocationHistory(parse('0'));
  history.acquire(account, parse('10'), parse(cheapCost));
  history.acquire(account, parse('10'), parse(expensiveCost));
  assert.equal(history.dispose(account, parse('10'), parse(saleCost)), null);
  return history;
}

test('merges independent ambiguous histories before constraining a transfer', () => {
  const history = ambiguousHistory('Source', '10', '30', '20');
  history.merge(ambiguousHistory('Destination', '20', '60', '40'));
  assert.equal(history.dispose('Source', parse('5'), parse('5'), 'Destination', parse('5')), null);
  const failure = history.dispose('Destination', parse('6'), parse('6'));
  assert.equal(format(failure.minimum), '7');
  assert.equal(format(failure.maximum), '32');
});

test('preserves ambiguous constraints through a full transfer and a reverse split', () => {
  const history = ambiguousHistory('Source', '10', '30', '20');
  assert.equal(history.dispose('Source', parse('10'), parse('20'), 'Destination', parse('10')), null);
  assert.equal(history.dispose('Destination', parse('10'), parse('20'), 'Destination', parse('5')), null);
  assert.equal(history.dispose('Destination', parse('2'), parse('4')), null);
  const failure = history.dispose('Destination', parse('2'), parse('9'));
  assert.equal(format(failure.minimum), '10');
  assert.equal(format(failure.maximum), '12');
});

function roundedHistory(quantity, cost, unit) {
  const history = new AllocationHistory(parse(unit));
  history.acquire('Broker', parse(quantity), parse(cost));
  return history;
}

for (const costs of [['0.34', '0.33', '0.33'], ['0.33', '0.34', '0.33'], ['0.33', '0.33', '0.34']]) {
  test(`allows the upward rounding on any disposal: ${costs.join(', ')}`, () => {
    const history = roundedHistory('3', '1', '0.01');
    for (const cost of costs) assert.equal(history.dispose('Broker', parse('1'), parse(cost)), null);
    assert.equal(format(history.total('Broker').quantity), '0');
    assert.equal(format(history.total('Broker').cost), '0');
  });
}

for (const cost of ['0.32', '0.35']) {
  test(`rejects ${cost} outside the adjacent rounded values of one third`, () => {
    const failure = roundedHistory('3', '1', '0.01').dispose('Broker', parse('1'), parse(cost));
    assert.equal(format(failure.minimum), '1/3');
    assert.equal(format(failure.maximum), '1/3');
  });
}

for (const cost of ['0.99', '1.01']) {
  test(`rejects a whole rounding step from an exactly representable cost: ${cost}`, () => {
    const failure = roundedHistory('2', '2', '0.01').dispose('Broker', parse('1'), parse(cost));
    assert.equal(format(failure.minimum), '1');
    assert.equal(format(failure.maximum), '1');
  });
}

test('does not accumulate earlier rounding into an otherwise impossible final cost', () => {
  const history = roundedHistory('3', '1', '0.01');
  assert.equal(history.dispose('Broker', parse('1'), parse('0.34')), null);
  assert.equal(history.dispose('Broker', parse('1'), parse('0.34')), null);
  const failure = history.dispose('Broker', parse('1'), parse('0.32'));
  assert.equal(format(failure.minimum), '1/3');
  assert.equal(format(failure.maximum), '1/3');
});

test('requires zero booked basis after a complete disposal', () => {
  const history = roundedHistory('3', '1', '0.01');
  assert.equal(history.dispose('Broker', parse('1'), parse('0.34')), null);
  assert.equal(history.dispose('Broker', parse('1'), parse('0.34')), null);
  assert.ok(history.dispose('Broker', parse('1'), parse('0.34')));
});

test('preserves alternatives even when the booked cost equals a greedy endpoint', () => {
  const history = roundedHistory('1', '1', '0.01');
  history.acquire('Broker', parse('1'), parse('3'));
  assert.equal(history.dispose('Broker', parse('1'), parse('1')), null);
  // The first sale can take 0.999 cheap units and 0.001 expensive units.
  // Committing to the cheapest endpoint would incorrectly consume all cheap units.
  assert.equal(history.dispose('Broker', parse('0.001'), parse('0.001')), null);
});

for (const nextCost of ['1', '3']) {
  test(`preserves both allocation alternatives for a subsequent cost of ${nextCost}`, () => {
    const history = roundedHistory('10', '10', '0.01');
    history.acquire('Broker', parse('10'), parse('30'));
    assert.equal(history.dispose('Broker', parse('10'), parse('20')), null);
    assert.equal(history.dispose('Broker', parse('1'), parse(nextCost)), null);
  });
}

test('requires one jointly feasible history rather than independent disposal bounds', () => {
  const history = roundedHistory('1', '1', '0.01');
  history.acquire('Broker', parse('1'), parse('3'));
  assert.equal(history.dispose('Broker', parse('1'), parse('1')), null);
  assert.ok(history.dispose('Broker', parse('0.5'), parse('0.5')));
});

test('retains strict historical boundaries when a later exact cost only touches their closure', () => {
  const history = roundedHistory('1', '0.005', '0.01');
  history.acquire('Broker', parse('1'), parse('0.025'));
  assert.equal(history.dispose('Broker', parse('1'), parse('0.01')), null);
  // Fewer than 0.75 cheap units remain. Selling exactly 0.75 cheap units
  // would force the earlier cost to 0.02, a forbidden full-cent error.
  assert.ok(history.dispose('Broker', parse('0.75'), parse('0.00375')));
});

test('does not borrow from later purchases or relax quantity availability', () => {
  const history = roundedHistory('1', '1', '0.01');
  assert.deepEqual(history.dispose('Broker', parse('1.001'), parse('1')), { insufficient: true });
  history.acquire('Broker', parse('1'), parse('3'));
  assert.equal(history.invalid, true);
});

test('checks more precise booked costs exactly instead of rounding them again', () => {
  assert.equal(roundedHistory('2', '0.666', '0.01').dispose('Broker', parse('1'), parse('0.333')), null);
  assert.ok(roundedHistory('3', '1', '0.01').dispose('Broker', parse('1'), parse('0.333')));
});

test('uses the declared monetary step rather than assuming two decimal places', () => {
  assert.equal(roundedHistory('3', '1', '0.001').dispose('Broker', parse('1'), parse('0.334')), null);
  assert.ok(roundedHistory('3', '1', '0.001').dispose('Broker', parse('1'), parse('0.34')));
  assert.equal(roundedHistory('3', '10', '1').dispose('Broker', parse('1'), parse('4')), null);
});

test('preserves exact acquisition cost through rounded transfers and splits', () => {
  const history = roundedHistory('3', '1', '0.01');
  assert.equal(history.dispose('Broker', parse('1'), parse('0.34'), 'Other', parse('2')), null);
  assert.equal(history.dispose('Other', parse('1'), parse('0.17')), null);
  assert.equal(history.dispose('Other', parse('1'), parse('0.17')), null);
  assert.equal(history.dispose('Broker', parse('1'), parse('0.33')), null);
  assert.equal(history.dispose('Broker', parse('1'), parse('0.33')), null);
});

test('retains rounded constraints when merging independently ambiguous histories', () => {
  const source = roundedHistory('1', '0.005', '0.01');
  source.acquire('Broker', parse('1'), parse('0.025'));
  assert.equal(source.dispose('Broker', parse('1'), parse('0.01')), null);
  const target = new AllocationHistory(parse('0.01'));
  target.acquire('Other', parse('1'), parse('1'));
  target.acquire('Other', parse('1'), parse('3'));
  assert.equal(target.dispose('Other', parse('1'), parse('2')), null);
  target.merge(source);
  assert.ok(target.dispose('Broker', parse('0.75'), parse('0.00375')));
});

test('carries the entire booked remainder through a split without resetting exact prices', () => {
  const history = roundedHistory('6', '2', '0.01');
  for (let index = 0; index < 3; index++) {
    assert.equal(history.dispose('Broker', parse('1'), parse('0.34')), null);
  }
  assert.equal(history.dispose('Broker', parse('3'), parse('0.98'), 'Broker', parse('6')), null);
  // Each post-split unit still costs exactly 1/6, despite booked basis 0.98.
  assert.equal(history.dispose('Broker', parse('1'), parse('0.17')), null);
  assert.ok(history.dispose('Broker', parse('1'), parse('0.15')));
});

test('retains strict history across a full transfer before checking the destination', () => {
  const history = roundedHistory('1', '0.005', '0.01');
  history.acquire('Broker', parse('1'), parse('0.025'));
  assert.equal(history.dispose('Broker', parse('1'), parse('0.01')), null);
  assert.equal(history.dispose('Broker', parse('1'), parse('0.02'), 'Other', parse('1')), null);
  assert.ok(history.dispose('Other', parse('0.75'), parse('0.00375')));
});

test('accepts a strictly interior witness arbitrarily close to an excluded boundary', () => {
  const history = roundedHistory('1', '0.005', '0.01');
  history.acquire('Broker', parse('1'), parse('0.025'));
  assert.equal(history.dispose('Broker', parse('1'), parse('0.01')), null);
  assert.equal(history.dispose('Broker', parse('0.75'), parse('0.003750000000000000000001')), null);
});
