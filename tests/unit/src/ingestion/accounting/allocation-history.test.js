'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { AllocationHistory } = resolveRepositoryModule('src/ingestion/accounting/allocation-history.js');
const { parse, format } = resolveRepositoryModule('src/core/rational.js');

function ambiguousHistory(account, cheapCost, expensiveCost, saleCost) {
  const history = new AllocationHistory();
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
