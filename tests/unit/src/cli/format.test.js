'use strict';

const { resolveCommands, resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const cliFormat = resolveRepositoryModule('src/impl/cli/cli-format.js');
const {
  appendTotal,
  formatWarnings,
} = cliFormat;
const commands = new Map(resolveCommands().map((command) => [command.name, command]));

function formatCommand(name, result, cliOptions, descriptions) {
  const command = commands.get(name);
  const output = command.prepareOutput
    ? command.prepareOutput(result, cliOptions, cliFormat)
    : result;
  if (cliOptions.format === 'json') return cliFormat.formatJson(output);
  return cliOptions.format === 'csv'
    ? command.formatCsv(output, cliOptions, cliFormat)
    : command.formatText(output, cliOptions, cliFormat, descriptions);
}

const formatAggregateText = (rows, denominate, descriptions, groupBy) =>
  formatCommand('aggregate', rows, {
    format: 'text',
    denominate,
    groupBy,
  }, descriptions);
const formatCsv = (rows, denominate, groupBy) =>
  formatCommand('aggregate', rows, { format: 'csv', denominate, groupBy });
const formatHumanReadable = (rows, denominate, descriptions, groupBy) =>
  denominate && groupBy !== 'commodity'
    ? formatCommand('unrealized-gains', rows, { format: 'text' }, descriptions)
    : formatAggregateText(rows, denominate, descriptions, groupBy);
const formatInvestmentPerformanceCsv = (report) =>
  formatCommand('investment-performance', report, { format: 'csv' });
const formatCommodities = (rows, output) => formatCommand('commodities', rows, output);
const formatPostings = (rows, output) => formatCommand('postings', rows, output);
const formatTags = (rows, output) => formatCommand('tags', rows, output);
const formatTransactions = (transactions, descriptions) => formatCommand('transactions', {
  transactions,
}, { format: 'text' }, descriptions);

const rows = [
  { account: 'Assets:Cash,Main', quantity: '2.005', commodity: 'SEK' },
  { account: 'Assets:LongAccount', quantity: '10000', commodity: 'SEK' },
];
const rowsWithTotal = [
  ...rows,
  {
    account: 'Total',
    quantity: '10002.005',
    commodity: 'SEK',
    isTotal: true,
  },
];

test('formats grouped warnings for a terminal', () => {
  assert.equal(formatWarnings([]), '');
  assert.equal(formatWarnings([{
    code: 'SYNTAX_ERROR',
    message: 'Expected a posting',
    instances: [{
      source: '/books/main.ledger',
      line: 12,
      column: 3,
      startLine: 10,
      endLine: 13,
    }, {
      source: '/books/included.ledger',
      line: 4,
      column: null,
      startLine: 4,
      endLine: 4,
    }],
  }]), '[SYNTAX_ERROR] Expected a posting\n' +
    '  /books/main.ledger:12:3 (affected lines 10-13)\n' +
    '  /books/included.ledger:4\n');
});

test('prints transaction annotations and balance markers with declared precision', () => {
  const posting = (account, amount, overrides) => ({
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

test('puts aligned amounts before left-aligned accounts', () => {
  assert.equal(
    formatHumanReadable(rowsWithTotal, true),
    '     2.01 SEK  Assets:Cash,Main\n' +
    '10,000.00 SEK  Assets:LongAccount\n' +
    '-------------\n' +
    '10,002.01 SEK  Total\n',
  );
  assert.equal(formatHumanReadable([], true), '');
  assert.equal(
    formatHumanReadable([
      { quantity: '1234.5', commodity: 'SEK' },
      { quantity: '2', commodity: 'FUND' },
    ], false, [{ commodity: 'SEK', format: '1,000.00 SEK' }], 'commodity'),
    '1,234.50 SEK\n    2    FUND\n',
  );
  assert.equal(
    formatCsv([{ quantity: '1234.5', commodity: 'SEK' }], false, 'commodity'),
    'amount,commodity\n1234.5,SEK\n',
  );
});

test('appends an exact total without mutating report rows', () => {
  const input = [
    { account: 'Assets:A', quantity: '0.1', commodity: 'SEK' },
    { account: 'Assets:B', quantity: '0.2', commodity: 'SEK' },
  ];
  assert.deepEqual(appendTotal(input), [
    ...input,
    { account: 'Total', quantity: '0.3', commodity: 'SEK', isTotal: true },
  ]);
  assert.equal(input.length, 2);
  assert.deepEqual(appendTotal([]), []);
});

test('writes one investment performance CSV row with nested API fields', () => {
  const report = {
    from: null,
    to: null,
    commodities: ['FUND,A'],
    valuationCommodity: 'USD',
    openingValue: 0,
    endingValue: 10,
    netContributions: 10,
    profitLoss: 0,
    timeWeightedReturn: null,
    timeWeightedReturnAnnualized: null,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
    points: [{ date: '2024-01-01', value: 10 }],
  };
  assert.equal(formatInvestmentPerformanceCsv(report),
    'from,to,commodities,valuationCommodity,openingValue,endingValue,netContributions,' +
    'profitLoss,timeWeightedReturn,timeWeightedReturnAnnualized,moneyWeightedReturn,' +
    'moneyWeightedReturnTotal,points\n' +
    ',,"[""FUND,A""]",USD,0,10,10,0,,,,,"[{""date"":""2024-01-01"",""value"":10}]"\n');
});

test('formats tag and commodity listings as text, JSON, and CSV', () => {
  const tags = [{ tag: 'Imported' }, { tag: 'Reviewed, manually' }];
  const commodities = [{
    commodity: 'SEK', comment: 'Swedish krona', format: '1,000.00 SEK',
    isDefault: true, used: true,
  }, {
    commodity: 'US, Dollar', comment: null, format: null,
    isDefault: false, used: false,
  }];

  assert.equal(formatTags(tags, { format: 'text' }), 'Imported\nReviewed, manually\n');
  assert.equal(formatTags(tags, { format: 'json' }), `${JSON.stringify([
    'Imported', 'Reviewed, manually',
  ], null, 2)}\n`);
  assert.equal(formatTags(tags, { format: 'csv' }), 'tag\nImported\n"Reviewed, manually"\n');
  assert.equal(
    formatCommodities(commodities, { details: false, format: 'text' }),
    'SEK\nUS, Dollar\n',
  );
  assert.equal(
    formatCommodities(commodities, { details: false, format: 'csv' }),
    'commodity\nSEK\n"US, Dollar"\n',
  );
  assert.equal(formatCommodities([], { details: false, format: 'text' }), '');
  assert.equal(
    formatCommodities(commodities, { details: true, format: 'json' }),
    `${JSON.stringify(commodities, null, 2)}\n`,
  );
  assert.equal(
    formatCommodities(commodities, { details: true, format: 'csv' }),
    'commodity,comment,format,isDefault,used\n' +
    'SEK,Swedish krona,"1,000.00 SEK",true,true\n' +
    '"US, Dollar",,,false,false\n',
  );
  assert.equal(
    formatCommodities(commodities, { details: true, format: 'text' }),
    'Commodity   Default  Used  Format        Comment\n' +
    '----------  -------  ----  ------------  -------------\n' +
    'SEK         yes      yes   1,000.00 SEK  Swedish krona\n' +
    'US, Dollar\n',
  );
});

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
