'use strict';

const { resolveRepositoryModule } = require("../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  appendTotal,
  formatCsv,
  formatBalanceHistoryCsv,
  formatBalanceHistoryHumanReadable,
  formatHumanReadable,
  formatInvestmentPerformance,
  formatInvestmentPerformanceJson,
  formatTransactions,
  formatJson,
  formatWarnings,
  formatAccounts,
  formatCommodities,
  formatPrices,
  formatPostings,
  formatTags,
} = resolveRepositoryModule("src/cli/cli-format.js");

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

test('formats balance history', () => {
  const balanceRows = [
    { date: '2024-01-01', amount: '2.005', commodity: 'USD' },
    { date: '2024-01-02', amount: '10000', commodity: 'USD' },
  ];
  assert.equal(
    formatBalanceHistoryCsv(balanceRows),
    'date,amount\n2024-01-01,2.01\n2024-01-02,10000.00\n',
  );
  assert.equal(
    formatBalanceHistoryHumanReadable(balanceRows),
    '2024-01-01       2.01 USD\n2024-01-02  10,000.00 USD\n',
  );
  assert.deepEqual(balanceRows.map((row) => row.amount), ['2.005', '10000']);
});

test('uses the valuation commodity format for human-readable valuation reports', () => {
  const descriptions = [{ commodity: 'EUR', format: '1,000.000 EUR' }];
  assert.equal(
    formatBalanceHistoryHumanReadable([
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

test('formats arbitrary API results as readable JSON', () => {
  assert.equal(formatJson({ value: '10' }), '{\n  "value": "10"\n}\n');
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
    '2024/01/02 FUND         12.5 SEK\n',
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
      comment: 'imported',
      notes: ['Project: Home'],
      postings: [{
        postingDate: '2024-01-03',
        account: 'Assets:Cash',
        comment: 'card',
        amount: { quantity: '-5', commodity: 'SEK' },
        lotCost: null,
        cost: null,
        balanceAssignment: null,
        balanceAssertion: null,
        amounts: [{ quantity: '-5', commodity: 'SEK' }],
      }, {
        postingDate: '2024-01-03',
        account: 'Expenses:Food',
        comment: null,
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
    '2024/01/03 Shop | Groceries ; imported\n' +
    '    ; Project: Home\n' +
    '    Assets:Cash                               -5 SEK  ; card\n' +
    '    Expenses:Food\n',
  );
  assert.equal(
    formatTransactions(report, { format: 'csv' }),
    'transactionId,transactionDate,description,transactionComment,postingDate,account,' +
    'postingComment,quantity,commodity\n' +
    '7,2024-01-03,Shop | Groceries,imported,2024-01-03,Assets:Cash,card,-5,SEK\n' +
    '7,2024-01-03,Shop | Groceries,imported,2024-01-03,Expenses:Food,,5,SEK\n',
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
    transactionId: 7,
    transactionDate: '2024-01-02',
    description: 'Buy, fund',
    transactionComment: 'imported',
    transactionNotes: ['Project: Savings'],
    postingDate: '2024-01-03',
    account: 'Assets:Fund',
    postingComment: '[2024-01-03] broker',
    amount: { quantity: '10', commodity: 'FUND' },
    lotCost: { quantity: '10', commodity: 'SEK', isTotal: false },
    cost: { quantity: '100', commodity: 'SEK', isTotal: true },
    balanceAssignment: null,
    balanceAssertion: { quantity: '10', commodity: 'FUND' },
    amounts: [{ quantity: '10', commodity: 'FUND' }],
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
    'postingId,transactionId,transactionDate,description,transactionComment,' +
    'transactionNotes,postingDate,account,postingComment,amountQuantity,amountCommodity,' +
    'lotCostQuantity,lotCostCommodity,lotCostIsTotal,costQuantity,costCommodity,costIsTotal,' +
    'balanceAssignmentQuantity,balanceAssignmentCommodity,balanceAssertionQuantity,' +
    'balanceAssertionCommodity,resolvedQuantity,resolvedCommodity\n' +
    '8,7,2024-01-02,"Buy, fund",imported,"[""Project: Savings""]",2024-01-03,' +
    'Assets:Fund,[2024-01-03] broker,10,FUND,10,SEK,false,100,SEK,true,,,10,FUND,10,FUND\n',
  );
  assert.equal(formatPostings([], { format: 'text' }), '');
});
