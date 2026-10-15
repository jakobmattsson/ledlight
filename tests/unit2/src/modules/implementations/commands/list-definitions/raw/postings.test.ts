'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/raw/postings.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

const formatPostings = (rows: unknown[], options: { format: string }) => format(rows, options);

test('formats complete posting rows as text, JSON, and flat CSV', () => {
  const postings = [{
    postingId: 8,
    filename: '/books/included, journal.ledger',
    transactionSourceLine: 12,
    transactionId: 7,
    transactionDate: '2024-01-02',
    description: 'Buy, fund',
    transactionComments: ['imported', 'Project: Savings'],
    postingDate: '2024-01-03',
    account: 'Assets:Fund',
    postingComments: ['broker'],
    amount: { quantity: '10', commodity: 'FUND' },
    lotCost: { quantity: '10', commodity: 'SEK', isTotal: false },
    cost: { quantity: '100', commodity: 'SEK', isTotal: true },
    balanceAssignment: null,
    balanceAssertion: { quantity: '10', commodity: 'FUND' },
    amounts: [{ quantity: '10', commodity: 'FUND', balance: '25' }],
  }];

  assert.match(
    formatPostings(postings, { format: 'text' }),
    /2024-01-02\s+2024-01-03\s+Buy, fund\s+Assets:Fund\s+10\s+FUND/u,
  );
  assert.equal(
    formatPostings(postings, { format: 'json' }),
    `${JSON.stringify(postings, null, 2)}\n`,
  );
  assert.equal(
    formatPostings(postings, { format: 'csv' }),
    'postingId,transactionId,transactionDate,description,' +
    'transactionComments,transactionTags,postingDate,account,postingComments,postingTags,' +
    'amountQuantity,amountCommodity,' +
    'lotCostQuantity,lotCostCommodity,lotCostIsTotal,costQuantity,costCommodity,costIsTotal,' +
    'balanceAssignmentQuantity,balanceAssignmentCommodity,balanceAssertionQuantity,' +
    'balanceAssertionCommodity,resolvedQuantity,resolvedCommodity,resolvedBalance,' +
    'filename,transactionSourceLine\n' +
    '8,7,2024-01-02,"Buy, fund","[""imported"",""Project: Savings""]",[],2024-01-03,' +
    'Assets:Fund,"[""broker""]",[],10,FUND,10,SEK,false,100,SEK,true,,,10,FUND,10,FUND,25,' +
    '"/books/included, journal.ledger",12\n',
  );
  assert.match(
    formatPostings(postings, { format: 'text' }),
    /\/books\/included, journal\.ledger\s+12/u,
  );
  assert.equal(formatPostings([], { format: 'text' }), '');
});
