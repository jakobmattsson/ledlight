'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseLedgerText } = require('../../../../src');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { printEntry } = resolveRepositoryModule('src/impl/core/journal-printer.js');

test('prints every supported posting annotation without changing its syntax', () => {
  const source = `2024-01-01 Trade
  Assets:Unit  2 FUND {250 SEK} @ 300 SEK
  Assets:Total  3.5 FUND {{875 SEK}} @@ 1000.25 SEK
  Assets:Cash  -1000.25 SEK = 2500.00 SEK
  Assets:Assigned  = 10 SEK
`;
  const { entries: [transaction] } = parseLedgerText(source);
  const printed = printEntry(transaction);

  assert.equal(printed, `2024-01-01 Trade
    Assets:Unit  2 FUND {250 SEK} @ 300 SEK
    Assets:Total  3.5 FUND {{875 SEK}} @@ 1000.25 SEK
    Assets:Cash  -1000.25 SEK = 2500.00 SEK
    Assets:Assigned  = 10 SEK`);
  const reparsed = parseLedgerText(`${printed}\n`).entries[0];
  assert.deepEqual(
    reparsed.postings.map(({ amount, lotCost, cost, balanceAssignment, balanceAssertion }) => ({
      amount, lotCost, cost, balanceAssignment, balanceAssertion,
    })),
    transaction.postings.map(({ amount, lotCost, cost, balanceAssignment, balanceAssertion }) => ({
      amount, lotCost, cost, balanceAssignment, balanceAssertion,
    })),
  );
});
