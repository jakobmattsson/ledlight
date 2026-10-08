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
const formatTotalHistoryCsv = (rows) =>
  formatCommand('total-history', rows, { format: 'csv' });
const formatTotalHistoryHumanReadable = (rows, descriptions) =>
  formatCommand('total-history', rows, { format: 'text' }, descriptions);
const formatInvestmentPerformance = (report, descriptions) =>
  formatCommand('investment-performance', report, { format: 'text' }, descriptions);
const formatInvestmentPerformanceJson = (report) =>
  formatCommand('investment-performance', report, { format: 'json' });
const formatInvestmentPerformanceCsv = (report) =>
  formatCommand('investment-performance', report, { format: 'csv' });
const formatAccounts = (rows, output) => formatCommand('accounts', rows, output);
const formatCommodities = (rows, output) => formatCommand('commodities', rows, output);
const formatPostings = (rows, output) => formatCommand('postings', rows, output);
const formatPrices = (rows, output, descriptions) =>
  formatCommand('prices', rows, output, descriptions);
const formatTags = (rows, output) => formatCommand('tags', rows, output);
const formatTransactions = (report, output, descriptions) =>
  formatCommand('transactions', report, output, descriptions);

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

test('formats RFC-style CSV and exact valuation rounding', () => {
  assert.equal(
    formatCsv([
      { account: 'Assets:"Cash",Main', quantity: '1.005', commodity: 'SEK' },
    ], true),
    'account,amount,commodity\n"Assets:""Cash"",Main",1.01,SEK\n',
  );
  assert.equal(formatCsv([], false), 'account,amount,commodity\n');
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

test('applies declared commodity precision and separators only to human-readable output', () => {
  const descriptions = [
    { commodity: 'BTC', format: '1000.00000000 BTC' },
    { commodity: 'EUR', format: '1,000.00 EUR' },
    { commodity: 'JPY', format: '1,000 JPY' },
  ];
  assert.equal(
    formatHumanReadable([
      { account: 'Assets:Bitcoin', quantity: '1234.5', commodity: 'BTC' },
      { account: 'Assets:Euros', quantity: '1234.5', commodity: 'EUR' },
      { account: 'Assets:Yen', quantity: '1234.5', commodity: 'JPY' },
    ], false, descriptions),
    ' 1234.50000000 BTC  Assets:Bitcoin\n' +
    '1,234.50       EUR  Assets:Euros\n' +
    '1,235          JPY  Assets:Yen\n',
  );
  assert.equal(
    formatCsv([{ account: 'Assets:Euros', quantity: '1234.5', commodity: 'EUR' }], false),
    'account,amount,commodity\nAssets:Euros,1234.5,EUR\n',
  );
});

test('formats valued account balances with Ledger column width and unlabeled totals', () => {
  const descriptions = [{ commodity: 'SEK', format: '1,000.00 SEK' }];
  const balances = [
    { account: 'Assets:Cash', quantity: '1000', commodity: 'SEK' },
    { account: 'Equity:Opening', quantity: '-1000', commodity: 'SEK' },
    { account: 'Total', quantity: '0', commodity: 'SEK', isTotal: true },
  ];
  assert.equal(formatAggregateText(balances, true, descriptions, 'account'),
    '        1,000.00 SEK  Assets:Cash\n' +
    '       -1,000.00 SEK  Equity:Opening\n' +
    '--------------------\n' +
    '                   0\n');
  assert.equal(formatAggregateText([{
    account: 'Total', quantity: '1234.567', commodity: 'SEK', isTotal: true,
  }], true, descriptions, 'account'),
  '--------------------\n        1,234.57 SEK\n');
  assert.equal(formatAggregateText([], true, descriptions, 'account'), '');
  assert.equal(formatAggregateText(balances, false, descriptions, 'account'),
    formatHumanReadable(balances, false, descriptions, 'account'));
  assert.equal(formatAggregateText([{ quantity: '1000', commodity: 'SEK' }],
    true, descriptions, 'commodity'), '1,000.00 SEK\n');
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

test('formats commodity totals together below a single separator', () => {
  const input = [
    { account: 'Assets:A', quantity: '1', commodity: 'USD' },
    { account: 'Assets:B', quantity: '2', commodity: 'FUND' },
    { account: 'Assets:C', quantity: '3', commodity: 'USD' },
  ];
  const result = appendTotal(input);
  assert.deepEqual(result.slice(-2), [
    { account: 'Total', quantity: '2', commodity: 'FUND', isTotal: true },
    { account: 'Total', quantity: '4', commodity: 'USD', isTotal: true },
  ]);
  assert.equal(formatAggregateText(result, false, [], 'account'),
    '1 USD   Assets:A\n' +
    '2 FUND  Assets:B\n' +
    '3 USD   Assets:C\n' +
    '------\n' +
    '2 FUND  Total\n' +
    '4 USD   Total\n');
  assert.equal(formatCsv(result, false),
    'account,amount,commodity\nAssets:A,1,USD\nAssets:B,2,FUND\nAssets:C,3,USD\n' +
    'Total,2,FUND\nTotal,4,USD\n');
});

test('formats total history', () => {
  const totalRows = [
    { date: '2024-01-01', amount: '2.005', commodity: 'USD' },
    { date: '2024-01-02', amount: '10000', commodity: 'USD' },
  ];
  assert.equal(
    formatTotalHistoryCsv(totalRows),
    'date,amount\n2024-01-01,2.01\n2024-01-02,10000.00\n',
  );
  assert.equal(
    formatTotalHistoryHumanReadable(totalRows),
    '2024-01-01       2.01 USD\n2024-01-02  10,000.00 USD\n',
  );
  assert.deepEqual(totalRows.map((row) => row.amount), ['2.005', '10000']);
});

test('uses the valuation commodity format for human-readable valuation reports', () => {
  const descriptions = [{ commodity: 'EUR', format: '1,000.000 EUR' }];
  assert.equal(
    formatTotalHistoryHumanReadable([
      { date: '2024-01-01', amount: '1234.5678', commodity: 'EUR' },
    ], descriptions),
    '2024-01-01  1,234.568 EUR\n',
  );
  const report = {
    from: '2024-01-01',
    to: '2024-01-01',
    commodities: [],
    valuationCommodity: 'EUR',
    openingValue: 1234.5678,
    netContributions: 0,
    endingValue: 1234.5678,
    profitLoss: 0,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
  };
  assert.match(formatInvestmentPerformance(report, descriptions), /Opening value: 1,234\.568 EUR/u);
});

test('formats investment performance for people and automation', () => {
  const report = {
    from: '2024-01-01',
    to: '2024-12-31',
    commodities: ['FUND'],
    valuationCommodity: 'USD',
    openingValue: 1000,
    netContributions: 250.5,
    endingValue: 1400,
    profitLoss: 149.5,
    timeWeightedReturn: 0.12345,
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: 0.2,
    points: [],
  };
  assert.equal(formatInvestmentPerformance(report),
    'Investment performance from 2024-01-01 to 2024-12-31\n' +
    'Instruments: 1\n' +
    'Opening value: 1,000.00 USD\n' +
    'Net contributions: 250.50 USD\n' +
    'Ending value: 1,400.00 USD\n' +
    'Profit/loss: 149.50 USD\n' +
    'Time-weighted return: 12.35 %\n' +
    'Money-weighted return (total): 20.00 %\n' +
    'Money-weighted return (annualized): n/a\n');
  assert.equal(formatInvestmentPerformanceJson(report), `${JSON.stringify(report, null, 2)}\n`);
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
    moneyWeightedReturn: null,
    moneyWeightedReturnTotal: null,
    points: [{ date: '2024-01-01', value: 10 }],
  };
  assert.equal(formatInvestmentPerformanceCsv(report),
    'from,to,commodities,valuationCommodity,openingValue,endingValue,netContributions,' +
    'profitLoss,timeWeightedReturn,moneyWeightedReturn,moneyWeightedReturnTotal,points\n' +
    ',,"[""FUND,A""]",USD,0,10,10,0,,,,"[{""date"":""2024-01-01"",""value"":10}]"\n');
});

test('formats ledger account names like Ledger by default', () => {
  const accounts = [
    { account: 'Assets:Cash', comment: 'Everyday account', transactionCount: 3 },
    { account: 'Equity:Opening', comment: null, transactionCount: 1 },
  ];
  assert.equal(
    formatAccounts(accounts, { details: false, format: 'text' }),
    'Assets:Cash\nEquity:Opening\n',
  );
  assert.equal(formatAccounts([], { details: false, format: 'text' }), '');
  assert.equal(
    formatAccounts(accounts, { details: false, format: 'json' }),
    '[\n  "Assets:Cash",\n  "Equity:Opening"\n]\n',
  );
  assert.equal(
    formatAccounts(accounts, { details: false, format: 'csv' }),
    'account\nAssets:Cash\nEquity:Opening\n',
  );
});

test('formats detailed accounts as text, JSON, and CSV', () => {
  const accounts = [
    { account: 'Assets:Cash, Main', comment: 'Everyday "account"', transactionCount: 3 },
    { account: 'Equity:Opening', comment: null, transactionCount: 1 },
  ];
  assert.equal(
    formatAccounts(accounts, { details: true, format: 'text' }),
    'Transactions  Account            Comment\n' +
    '------------  -----------------  ------------------\n' +
    '           3  Assets:Cash, Main  Everyday "account"\n' +
    '           1  Equity:Opening\n',
  );
  assert.equal(
    formatAccounts(accounts, { details: true, format: 'json' }),
    `${JSON.stringify(accounts, null, 2)}\n`,
  );
  assert.equal(
    formatAccounts(accounts, { details: true, format: 'csv' }),
    'account,comment,transactionCount\n' +
    '"Assets:Cash, Main","Everyday ""account""",3\n' +
    'Equity:Opening,,1\n',
  );
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

test('formats prices as text, JSON, and CSV', () => {
  const prices = [{
    date: '2024-01-02',
    baseCommodity: 'FUND',
    quoteQuantity: '12.5',
    quoteCommodity: 'SEK',
    comment: 'Closing, official',
  }];

  assert.equal(
    formatPrices(prices, { format: 'text' }),
    '2024-01-02 FUND         12.5 SEK\n',
  );
  assert.equal(formatPrices(prices, { format: 'json' }), `${JSON.stringify(prices, null, 2)}\n`);
  assert.equal(
    formatPrices(prices, { format: 'csv' }),
    'date,baseCommodity,quoteQuantity,quoteCommodity,comment\n' +
    '2024-01-02,FUND,12.5,SEK,"Closing, official"\n',
  );
  assert.equal(formatPrices([], { format: 'text' }), '');
});

test('formats paginated transactions as Ledger-like text, JSON, and flat CSV', () => {
  const report = {
    order: 'oldest',
    page: 1,
    pageSize: 100,
    totalTransactions: 1,
    totalPages: 1,
    transactions: [{
      transactionId: 7,
      transactionDate: '2024-01-03',
      description: 'Shop | Groceries',
      comments: ['imported', 'Project: Home'],
      postings: [{
        postingDate: '2024-01-03',
        account: 'Assets:Cash',
        comments: ['card'],
        amount: { quantity: '-5', commodity: 'SEK' },
        lotCost: null,
        cost: null,
        balanceAssignment: null,
        balanceAssertion: null,
        amounts: [{ quantity: '-5', commodity: 'SEK' }],
      }, {
        postingDate: '2024-01-03',
        account: 'Expenses:Food',
        comments: [],
        amount: null,
        lotCost: null,
        cost: null,
        balanceAssignment: null,
        balanceAssertion: null,
        amounts: [{ quantity: '5', commodity: 'SEK' }],
      }],
    }],
  };

  assert.equal(
    formatTransactions(report, { format: 'text' }),
    '2024-01-03 Shop | Groceries ; imported\n' +
    '    ; Project: Home\n' +
    '    Assets:Cash                               -5 SEK  ; card\n' +
    '    Expenses:Food\n',
  );
  assert.equal(
    formatTransactions(report, { format: 'csv' }),
    'transactionId,transactionDate,description,transactionComments,transactionTags,postingDate,' +
    'account,postingComments,postingTags,quantity,commodity\n' +
    '7,2024-01-03,Shop | Groceries,"[""imported"",""Project: Home""]",' +
    '[],2024-01-03,Assets:Cash,"[""card""]",[],-5,SEK\n' +
    '7,2024-01-03,Shop | Groceries,"[""imported"",""Project: Home""]",' +
    '[],2024-01-03,Expenses:Food,[],[],5,SEK\n',
  );
  assert.equal(
    formatTransactions(report, { format: 'json' }),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.equal(
    formatTransactions({ ...report, transactions: [] }, { format: 'text' }),
    '',
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
