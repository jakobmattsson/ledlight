'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { asValue } = require('awilix');
const { createRepositoryContainer } = require('../../../../../src/composition/repository-container');

const declarations = `commodity SEK
  default
  format 1,000.00 SEK
commodity USD
  format 1,000.00 USD
commodity STOCK
  format 1,000 STOCK
account Assets:SEK
account Assets:USD
account Assets:Stock
account Assets:Other
account Income:Stock
account Income:FX
P 2024-01-01 USD 10 SEK
P 2024-01-01 STOCK 12 USD
P 2024-01-02 USD 11 SEK
P 2024-01-04 USD 12 SEK
P 2024-01-05 USD 13 SEK
`;
const purchase = `
2024-01-01 Buy dollars
  Assets:USD  10 USD {10 SEK}
  Assets:SEK  -100 SEK

2024-01-01 Buy shares
  Assets:Stock  1 STOCK {10 USD}
  Assets:USD
`;

function fixture(t, source, defaultFormat) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-currency-capital-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, declarations.replace('1,000.00 SEK', `${defaultFormat ?? '1,000.00'} SEK`) + source);
  const container = createRepositoryContainer();
  container.register('processEnvironment', asValue({ LEDLIGHT_CACHE_HOME: path.join(directory, 'cache') }));
  return container.resolve('project').openJournal(journalPath);
}

function assertTotal(journal, to, total) {
  const aggregate = journal.aggregate({ to, inValuationCommodity: true, includeTotal: true });
  assert.equal(aggregate.at(-1)?.quantity ?? '0', total);
  assert.equal(journal.balanceHistoryReport({ to }).at(-1).amount, total);
  const { addDecimals, parseDecimal, formatDecimal } = createRepositoryContainer().resolve('decimal');
  const gain = journal.unrealizedGains({ to }).reduce(
    (sum, row) => addDecimals(sum, parseDecimal(row.quantity)), parseDecimal('0'),
  );
  assert.equal(formatDecimal(gain), total);
}

test('separates native stock gains and currency capital through sale and complete repatriation', (t) => {
  const journal = fixture(t, purchase + `
2024-01-03 Sell shares
  Assets:Stock  -1 STOCK {10 USD} @ 12 USD
  Assets:USD  12 USD
  Income:Stock  -2 USD

2024-01-04 Convert capital and realized profit to SEK
  Assets:USD  -12 USD {{124 SEK}} @@ 144 SEK
  Assets:SEK  144 SEK
  Income:FX  -20 SEK
  Income:Stock  2 USD {12 SEK}
  Income:Stock  -24 SEK
`);
  assert.deepEqual(journal.warnings, []);
  assert.deepEqual(journal.unrealizedGains({ to: '2024-01-02' }), [
    { account: 'Assets:Stock', quantity: '22', commodity: 'SEK' },
    { account: 'Currency capital (USD)', quantity: '10', commodity: 'SEK', isCurrencyCapital: true },
  ]);
  assert.deepEqual(journal.unrealizedGains({ to: '2024-01-02', accounts: ['^Assets:Stock$'] }), [
    { account: 'Assets:Stock', quantity: '22', commodity: 'SEK' },
  ]);
  assert.deepEqual(journal.unrealizedGains({ to: '2024-01-03' }), [
    { account: 'Currency capital (USD)', quantity: '10', commodity: 'SEK', isCurrencyCapital: true },
  ]);
  for (const [date, total] of [
    ['2024-01-01', '20'], ['2024-01-02', '32'], ['2024-01-03', '10'],
    ['2024-01-04', '0'], ['2024-01-05', '0'],
  ]) assertTotal(journal, date, total);
  assert.deepEqual(journal.unrealizedGains(), []);
});

test('realizes a native stock loss and currency gain without retaining phantom currency exposure', (t) => {
  const journal = fixture(t, purchase + `
2024-01-03 Sell at a loss
  Assets:Stock  -1 STOCK {10 USD} @ 8 USD
  Assets:USD  8 USD
  Income:Stock  2 USD

2024-01-04 Translate the loss
  Income:Stock  -2 USD {10 SEK} @ 12 SEK
  Income:Stock  24 SEK
  Income:FX  -4 SEK

2024-01-04 Exchange remaining cash
  Assets:USD  -8 USD {10 SEK} @ 12 SEK
  Assets:SEK  96 SEK
  Income:FX  -16 SEK
`);
  assert.deepEqual(journal.warnings, []);
  assertTotal(journal, '2024-01-03', '10');
  assertTotal(journal, '2024-01-05', '0');
});

test('carries native basis through transfers and checks remaining allocations in the cost currency', (t) => {
  const journal = fixture(t, purchase.replace('1 STOCK {10 USD}', '2 STOCK {5 USD}') + `
2024-01-02 Transfer
  Assets:Stock  -1 STOCK {5 USD}
  Assets:Other  1 STOCK {5 USD}

2024-01-03 Partial sale
  Assets:Other  -0.5 STOCK {5 USD} @ 12 USD
  Assets:USD  6 USD
  Income:Stock  -3.5 USD
`);
  assert.deepEqual(journal.warnings, []);
  assertTotal(journal, '2024-01-03', '125.5');

  const invalid = fixture(t, purchase + `
2024-01-03 Incorrect partial disposal basis
  Assets:Stock  -0.5 STOCK {12 USD} @ 12 USD
  Assets:USD
`);
  assert.equal(invalid.warnings.some(({ code }) => code === 'IMPOSSIBLE_COST_BASIS'), true);
  assert.match(invalid.warnings.find(({ code }) => code === 'IMPOSSIBLE_COST_BASIS').message,
    /cost 6 USD; allowed range is 5 to 5 USD/u);
});

test('uses the native cost currency precision and detects its residual basis', (t) => {
  const opening = purchase.replace('10 USD {10 SEK}', '1 USD {100 SEK}')
    .replace('1 STOCK {10 USD}', '3 STOCK {{1 USD}}');
  const rounded = fixture(t, opening + `
2024-01-03 Rounded partial sale
  Assets:Stock  -1 STOCK {{0.34 USD}} @@ 0.5 USD
  Assets:USD  0.5 USD
  Income:Stock  -0.16 USD
`, '1,000');
  assert.deepEqual(rounded.warnings, []);

  const residual = fixture(t, opening + `
2024-01-03 Wrong closing cost
  Assets:Stock  -3 STOCK {{1.01 USD}} @@ 1.5 USD
  Assets:USD  1.5 USD
  Income:Stock  -0.49 USD
`);
  assert.deepEqual(residual.warnings.map(({ code }) => code), ['RESIDUAL_COST_BASIS']);
  assert.match(residual.warnings[0].message, /zero STOCK units retain cost basis -0.01 USD/u);
});

test('checks result mismatches in the native currency even inside balancing tolerances', (t) => {
  const journal = fixture(t, `
2024-01-01 Rounded cash without a balancing result
  Assets:Stock  1 STOCK {0.335 USD}
  Assets:USD  -0.34 USD
`);
  assert.deepEqual(journal.warnings.map(({ code }) => code), ['RESULT_MISMATCH']);
  assert.match(journal.warnings[0].message, /market value by 0.005 USD/u);
});

test('does not require an exchange rate to convert a zero native cost', (t) => {
  const journal = fixture(t, `
commodity EUR
  format 1,000.00 EUR
P 2024-01-01 STOCK 30 SEK
2024-01-01 Free shares
  Assets:Stock  1 STOCK {0 EUR} @ 0 EUR
`);
  assert.deepEqual(journal.warnings, []);
  assert.deepEqual(journal.unrealizedGains(), [
    { account: 'Assets:Stock', quantity: '30', commodity: 'SEK' },
  ]);
});

test('preserves capital allocation history through a unit split in a settlement commodity', (t) => {
  const journal = fixture(t, purchase.replace('1 STOCK {10 USD}', '1 STOCK {0 USD} @ 0 USD') + `
P 2024-01-02 USD 5 SEK
2024-01-02 Split currency units
  Assets:USD  -10 USD {10 SEK}
  Assets:USD  20 USD {5 SEK}

2024-01-03 Partial exchange
  Assets:USD  -10 USD {5 SEK} @ 5 SEK
  Assets:SEK  50 SEK
`);
  assert.deepEqual(journal.warnings, []);
  assertTotal(journal, '2024-01-03', '60');
});
