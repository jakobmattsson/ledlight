'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { LedgerSyntaxError, parse } = resolveRepositoryModule("src/ledlight/index.js");
const ohmParser = resolveRepositoryModule("src/ledlight/syntax/reference/parser.js");

function parseConformant(sourceText, source) {
  const document = parse(sourceText, { source });
  assert.deepEqual(document, ohmParser.parse(sourceText, { source }));
  return document;
}

test('parses transactions without losing decimal precision', () => {
  const document = parseConformant(`2024-01-29 * (trade-1) Investment ; imported
    Assets:Broker Account  8.000000000000000001 SECURITY @ 7786.140669608098 SEK ; exact cost
    Assets:Cash  = 67683.20 SEK
    Equity:Opening
`, 'fixture.ledger');

  assert.equal(document.entries.length, 1);
  const transaction = document.entries[0];
  assert.deepEqual(
    {
      date: transaction.date,
      status: transaction.status,
      code: transaction.code,
      description: transaction.description,
      comment: transaction.comment,
    },
    { date: '2024-01-29', status: '*', code: 'trade-1', description: 'Investment', comment: 'imported' },
  );
  assert.deepEqual(transaction.postings[0].amount, { quantity: '8.000000000000000001', commodity: 'SECURITY' });
  assert.deepEqual(transaction.postings[0].cost, {
    total: false,
    amount: { quantity: '7786.140669608098', commodity: 'SEK' },
  });
  assert.deepEqual(transaction.postings[1].balanceAssignment, { quantity: '67683.20', commodity: 'SEK' });
  assert.equal(transaction.postings[2].amount, null);
});

test('parses total costs and balance assertions', () => {
  const document = parseConformant(`2024/01/01 Trade
    Assets:Fund  3.5 FUND @@ 1000.25 SEK
    Assets:Cash  -1000.25 SEK = 2500.00 SEK
`, 'fixture.ledger');

  const transaction = document.entries[0];
  assert.equal(transaction.date, '2024-01-01');
  assert.equal(transaction.postings[0].cost.total, true);
  assert.deepEqual(transaction.postings[1].balanceAssertion, { quantity: '2500.00', commodity: 'SEK' });
});

test('rejects unsupported auxiliary transaction dates', () => {
  const sourceText = '2024-01-01=2024-01-02 Trade\n  Assets:Cash  1 SEK\n  Equity:Opening\n';
  assert.throws(() => parse(sourceText, { source: 'fixture.ledger' }), /Expected whitespace after transaction date/u);
  assert.throws(() => ohmParser.parse(sourceText, { source: 'fixture.ledger' }), LedgerSyntaxError);
});

test('keeps leading-point and trailing-point decimal syntax exact', () => {
  const document = parseConformant(`2024-01-01 Decimal forms
  Assets:Cash  .5 SEK
  Equity:Opening  -1. SEK
`, 'fixture.ledger');

  assert.deepEqual(document.entries[0].postings.map((posting) => posting.amount), [
    { quantity: '.5', commodity: 'SEK' },
    { quantity: '-1.', commodity: 'SEK' },
  ]);
});

test('parses declarations, commodity properties, prices, and source notes', () => {
  const document = parseConformant(`account Assets:Cash
tag Source
commodity SEK
  format 1,000.00 SEK
  default
P 2024-01-01 FUND 123.45 SEK ; closing

2024-01-01 Opening
  ; Source: statement.csv:4
  Assets:Cash  1 SEK
  Equity:Opening
`, 'fixture.ledger');

  assert.deepEqual(document.entries.map((entry) => entry.type), ['account', 'tag', 'commodity', 'price', 'transaction']);
  assert.deepEqual(document.entries[2].properties.map(({ name, value }) => ({ name, value })), [
    { name: 'format', value: '1,000.00 SEK' },
    { name: 'default', value: null },
  ]);
  assert.deepEqual(document.entries[3].price, { quantity: '123.45', commodity: 'SEK' });
  assert.deepEqual(document.entries[4].notes[0], {
    text: 'Source: statement.csv:4',
    key: 'Source',
    value: 'statement.csv:4',
    location: { source: 'fixture.ledger', line: 9, column: 3 },
  });
});

test('reports precise source locations for invalid input', () => {
  assert.throws(
    () => parse('2024-02-30 Invalid\n  Assets:Cash  1 SEK\n', { source: 'bad.ledger' }),
    (error) => error instanceof LedgerSyntaxError && error.message === 'bad.ledger:1:1: Invalid date "2024-02-30"',
  );
  assert.throws(
    () => parse('2024-01-01 Invalid\n  Assets:Cash  one SEK\n', { source: 'bad.ledger' }),
    /bad\.ledger:2:\d+: Expected a number for posting amount/,
  );
});

test('rejects unsupported commodity properties consistently', () => {
  const sourceText = 'commodity SEK\n  arbitrary value\n';
  assert.throws(
    () => parse(sourceText, { source: 'bad.ledger' }),
    (error) => error instanceof LedgerSyntaxError && /commodity property/u.test(error.message),
  );
  assert.throws(
    () => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
    (error) => error instanceof LedgerSyntaxError,
  );
});
