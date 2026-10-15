'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../../../support/repository-container.js');
const definition = resolveRepositoryModule('src/modules/implementations/commands/list-definitions/raw/transactions.js');
const cliFormat = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

function format(result: unknown, options: { format: string; [key: string]: unknown }, descriptions?: unknown) {
  const output = definition.prepareOutput ? definition.prepareOutput(result, options, cliFormat) : result;
  if (options.format === 'json') return cliFormat.formatJson(output);
  return options.format === 'csv'
    ? definition.formatCsv(output, options, cliFormat)
    : definition.formatText(output, options, cliFormat, descriptions);
}

const formatTransactions = (transactions: unknown[], descriptions: unknown) =>
  format({ transactions }, { format: 'text' }, descriptions);

test('prints transaction annotations and balance markers with declared precision', () => {
  const posting = (account: string, amount: { quantity: string; commodity: string }, overrides: Record<string, unknown>) => ({
    postingDate: '2024-01-01', account, comments: [], tags: [], amount,
    amounts: [amount], lotCost: null, cost: null,
    balanceAssignment: null, balanceAssertion: null, ...overrides,
  });
  const output = formatTransactions([{
    transactionDate: '2024-01-01', description: 'Annotated trade', comments: [], tags: [],
    postings: [
      posting('Assets:Fund', { quantity: '2', commodity: 'FUND' }, {
        lotCost: { quantity: '12.5', commodity: 'SEK', isTotal: false },
        cost: { quantity: '25', commodity: 'SEK', isTotal: true },
      }),
      posting('Assets:Cash', { quantity: '-25', commodity: 'SEK' }, {
        balanceAssertion: { quantity: '75', commodity: 'SEK' },
      }),
      posting('Assets:Assigned', { quantity: '3', commodity: 'FUND' }, {
        amount: null,
        balanceAssignment: { quantity: '3', commodity: 'FUND' },
      }),
    ],
  }], [
    { commodity: 'FUND', format: '1,000 FUND' },
    { commodity: 'SEK', format: '1,000.00 SEK' },
  ]);

  assert.match(output, /Assets:Fund\s+2 FUND \{12\.50 SEK\} @@ 25\.00 SEK/u);
  assert.match(output, /Assets:Cash\s+-25\.00 SEK = 75\.00 SEK/u);
  assert.match(output, /Assets:Assigned\s+3 FUND = 3 FUND/u);
});
