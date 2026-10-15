'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveTestModule } = require('../../../../../support/repository-container');
const { PostingResolver } = resolveTestModule('src/modules/implementations/accounting/posting-resolver.js');

test('resolves one implicit posting for every explicit commodity', () => {
  const location = { source: 'fixture.ledger', line: 1, column: 1 };
  const posting = (account: string, amount: { quantity: string; commodity: string } | null) => ({
    type: 'posting', account, amount, location,
    lotCost: null, cost: null, balanceAssignment: null, balanceAssertion: null,
    postingDate: null, comments: [],
  });
  const transaction = {
    type: 'transaction', date: '2024-01-01', description: 'Opening', location, comments: [],
    postings: [
      posting('Assets:Cash', { quantity: '10', commodity: 'SEK' }),
      posting('Assets:Fund', { quantity: '2', commodity: 'FUND' }),
      posting('Equity:Opening', null),
    ],
  };

  assert.deepEqual(new PostingResolver().resolve(transaction), [
    [{ quantity: '10', commodity: 'SEK' }],
    [{ quantity: '2', commodity: 'FUND' }],
    [
      { quantity: '-10', commodity: 'SEK' },
      { quantity: '-2', commodity: 'FUND' },
    ],
  ]);
});
