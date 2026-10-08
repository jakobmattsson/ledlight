'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { calculateFlows } = resolveRepositoryModule('src/impl/query-support/investment-flows.js');

function posting(amount, selected, marketRate) {
  return {
    transactionId: 1,
    date: '2024-01-02',
    account: 'Assets:Broker',
    amount,
    lotCost: null,
    cost: null,
    marketRate,
    lotRate: null,
    costRate: null,
    selectedAccount: true,
    selected,
  };
}

test('uses the counterposting value for an unannotated investment trade', () => {
  const postings = [
    posting({ quantity: '10', commodity: 'FUND' }, true, '5'),
    posting({ quantity: '-40', commodity: 'SEK' }, false, '1'),
  ];

  assert.deepEqual(calculateFlows(postings, {}, 'SEK'), [{ date: '2024-01-02', flow: 40 }]);
  assert.deepEqual(calculateFlows(postings, { from: '2024-01-03' }, 'SEK'), []);
  assert.deepEqual(calculateFlows(postings.slice(0, 1), {}, 'SEK'), [
    { date: '2024-01-02', flow: 50 },
  ]);
});

test('reports a missing price when an unannotated trade needs conversion', () => {
  assert.throws(
    () => calculateFlows([posting({ quantity: '10', commodity: 'FUND' }, true, null)], {}, 'SEK'),
    {
      code: 'LEDLIGHT_MISSING_VALUATION_DATA',
      message: 'No price for FUND on or before 2024-01-02 can convert a cash flow to SEK',
    },
  );
});
