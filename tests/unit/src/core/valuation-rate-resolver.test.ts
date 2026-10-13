'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { createLedgerValuationRateResolver } =
  resolveRepositoryModule('src/modules/implementations/core/valuation-rate-resolver.js');

test('prefers an older direct quote and falls back from an unusable newer quote', () => {
  const resolve = createLedgerValuationRateResolver([
    { date: '2024-01-01', base_commodity: 'FUND', quote_quantity: '10', quote_commodity: 'SEK' },
    { date: '2024-02-01', base_commodity: 'FUND', quote_quantity: '2', quote_commodity: 'NOK' },
  ], 'SEK');

  assert.equal(resolve('FUND', '2024-02-01'), '10');
});

test('rejects invalid valuation-rate lookup arguments', () => {
  const resolve = createLedgerValuationRateResolver([], 'SEK');
  assert.throws(() => resolve('', '2024-01-01'), {
    code: 'LEDLIGHT_INVALID_API_INPUT',
    name: 'TypeError',
  });
  assert.throws(() => resolve('FUND', null), {
    code: 'LEDLIGHT_INVALID_API_INPUT',
    name: 'TypeError',
  });
});
