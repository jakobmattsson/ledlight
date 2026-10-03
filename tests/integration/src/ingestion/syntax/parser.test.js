'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { errorCodes } = resolveRepositoryModule("src/core/public-errors.js");
const { parse } = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const ohmParser = resolveRepositoryModule(
  "src/ingestion/syntax/reference/reference-parser.js",
).$$private;

function parseConformant(sourceText, source) {
  const document = parse(sourceText, { source });
  assert.deepEqual(document, ohmParser.parse(sourceText, { source }));
  return document;
}

test('parses transactions without losing decimal precision', () => {
  const document = parseConformant(`2024-01-29 Investment ; imported
    Assets:Broker Account  8.000000000000000001 SECURITY @ 7786.140669608098 SEK ; exact cost
    Assets:Cash  = 67683.20 SEK
    Equity:Opening
`, 'fixture.ledger');

  assert.equal(document.entries.length, 1);
  const transaction = document.entries[0];
  assert.deepEqual(
    {
      date: transaction.date,
      description: transaction.description,
      comment: transaction.comment,
    },
    { date: '2024-01-29', description: 'Investment', comment: 'imported' },
  );
  assert.deepEqual(transaction.postings[0].amount, { quantity: '8.000000000000000001', commodity: 'SECURITY' });
  assert.deepEqual(transaction.postings[0].cost, {
    total: false,
    amount: { quantity: '7786.140669608098', commodity: 'SEK' },
  });
  assert.deepEqual(transaction.postings[1].balanceAssignment, { quantity: '67683.20', commodity: 'SEK' });
  assert.equal(transaction.postings[2].amount, null);
});

test('treats former transaction status and code syntax as description text', () => {
  for (const metadata of ['*', '!', '(trade-1)']) {
    const sourceText = `2024-01-29 ${metadata} Investment\n  Assets:Cash  1 SEK\n  Equity:Opening\n`;
    const transaction = parseConformant(sourceText, 'fixture.ledger').entries[0];
    assert.equal(transaction.description, `${metadata} Investment`);
    assert.equal('status' in transaction, false);
    assert.equal('code' in transaction, false);
  }
});

test('uses semicolons as the only top-level comment marker', () => {
  const document = parseConformant(`; top-level comment
2024-01-01 Transaction
  Assets:Cash  1 SEK
  Equity:Opening
`, 'fixture.ledger');

  assert.equal(document.entries.length, 1);

  for (const marker of ['#', '%', ':']) {
    const sourceText = `${marker} not a comment\n2024-01-01 Transaction\n  Assets:Cash  1 SEK\n  Equity:Opening\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('does not interpret other indented markers as comments', () => {
  const document = parseConformant(`2024-01-01 Transaction
  # not a comment
  Assets:Cash  1 SEK
  Equity:Opening
`, 'fixture.ledger');

  assert.equal(document.entries[0].notes.length, 0);
  assert.equal(document.entries[0].postings[0].account, '# not a comment');
});

test('requires a transaction description', () => {
  for (const header of ['2024-01-29 ', '2024-01-29 ; imported']) {
    const sourceText = `${header}\n  Assets:Cash  1 SEK\n  Equity:Opening\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('parses unit and total lot costs, transaction costs, and balance assertions', () => {
  const document = parseConformant(`2024-01-01 Trade
    Assets:Unit Lot  2 FUND {250 SEK} @ 300 SEK
    Assets:Total Lot  3.5 FUND {{875 SEK}} @@ 1000.25 SEK
    Assets:Cash  -1000.25 SEK = 2500.00 SEK
`, 'fixture.ledger');

  const transaction = document.entries[0];
  assert.equal(transaction.date, '2024-01-01');
  assert.deepEqual(transaction.postings[0].lotCost, {
    total: false,
    amount: { quantity: '250', commodity: 'SEK' },
  });
  assert.equal(transaction.postings[0].cost.total, false);
  assert.deepEqual(transaction.postings[1].lotCost, {
    total: true,
    amount: { quantity: '875', commodity: 'SEK' },
  });
  assert.equal(transaction.postings[1].cost.total, true);
  assert.deepEqual(transaction.postings[2].balanceAssertion, { quantity: '2500.00', commodity: 'SEK' });
});

test('rejects mismatched lot cost braces', () => {
  for (const annotation of ['{100 SEK}}', '{{100 SEK}']) {
    const sourceText = `2024-01-01 Trade\n  Assets:Fund  1 FUND ${annotation}\n  Equity:Opening\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('rejects slash date separators', () => {
  const sources = [
    '2024/01/01 Trade\n  Assets:Cash  1 SEK\n  Equity:Opening\n',
    'P 2024/01/01 FUND 1 SEK\n',
  ];

  for (const sourceText of sources) {
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('does not interpret a slash-separated comment value as a posting date', () => {
  const document = parseConformant(`2024-01-01 Trade
  Assets:Cash  1 SEK ; [2024/01/02] imported
  Equity:Opening
`, 'fixture.ledger');

  assert.equal(document.entries[0].postings[0].postingDate, null);
  assert.equal(document.entries[0].postings[0].comment, '[2024/01/02] imported');
});

test('parses canonical integer, signed, and decimal quantities', () => {
  const document = parseConformant(`2024-01-01 Canonical numbers
  Assets:Zero  0 SEK
  Assets:Positive  +1 SEK
  Assets:Negative  -1.25 SEK
`, 'fixture.ledger');

  assert.deepEqual(document.entries[0].postings.map((posting) => posting.amount.quantity), [
    '0', '+1', '-1.25',
  ]);
});

test('parses posting comments with and without preceding whitespace', () => {
  const document = parseConformant(`2024-01-01 Posting comments
  Assets:Compact  1 SEK;compact
  Assets:Spaced  -1 SEK ; spaced
`, 'fixture.ledger');

  assert.deepEqual(document.entries[0].postings.map((posting) => posting.comment), [
    'compact', 'spaced',
  ]);
});

test('parses transaction and posting tags without consuming comment text', () => {
  const document = parseConformant(`2024-01-01 Tagged ; :reviewed:imported: bank statement
  ; Source: bank export
  Assets:Cash  1 SEK ; Receipt: 1234
  Equity:Opening  -1 SEK ; :balanced: complete
`, 'fixture.ledger');

  const transaction = document.entries[0];
  assert.equal(transaction.comment, ':reviewed:imported: bank statement');
  assert.deepEqual(transaction.tags, [
    { name: 'reviewed', value: null },
    { name: 'imported', value: null },
    { name: 'Source', value: 'bank export' },
  ]);
  assert.deepEqual(transaction.notes[0], {
    text: 'Source: bank export',
    key: 'Source',
    value: 'bank export',
    tags: [{ name: 'Source', value: 'bank export' }],
    location: { source: 'fixture.ledger', line: 2, column: 3 },
  });
  assert.deepEqual(transaction.postings.map(({ comment, tags }) => ({ comment, tags })), [
    { comment: 'Receipt: 1234', tags: [{ name: 'Receipt', value: '1234' }] },
    { comment: ':balanced: complete', tags: [{ name: 'balanced', value: null }] },
  ]);
});

test('does not recognize embedded, whitespace, or typed tags', () => {
  const document = parseConformant(`2024-01-01 Untagged ; ordinary :embedded:
  Assets:Cash  1 SEK ; :two words:
  Equity:Opening  -1 SEK ; Key:: value
`, 'fixture.ledger');

  assert.equal('tags' in document.entries[0], false);
  assert.equal('tags' in document.entries[0].postings[0], false);
  assert.equal('tags' in document.entries[0].postings[1], false);
});

test('rejects unsupported auxiliary transaction dates', () => {
  const sourceText = '2024-01-01=2024-01-02 Trade\n  Assets:Cash  1 SEK\n  Equity:Opening\n';
  assert.throws(() => parse(sourceText, { source: 'fixture.ledger' }), /Expected whitespace after transaction date/u);
  assert.throws(
    () => ohmParser.parse(sourceText, { source: 'fixture.ledger' }),
    (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX,
  );
});

test('rejects decimals without digits on both sides of the point', () => {
  for (const quantity of ['.5', '-1.', '+.25', '+10.']) {
    const sourceText = `2024-01-01 Invalid decimal\n  Assets:Cash  ${quantity} SEK\n  Equity:Opening\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('rejects amounts without commodity symbols', () => {
  const sources = [
    '2024-01-01 Missing commodity\n  Assets:Cash  1\n  Equity:Opening\n',
    '2024-01-01 Missing commodity\n  Assets:Fund  1 FUND @ 10\n  Equity:Opening\n',
    '2024-01-01 Missing commodity\n  Assets:Cash  1 SEK = 1\n  Equity:Opening\n',
    '2024-01-01 Missing commodity\n  Assets:Cash  = 1\n  Equity:Opening\n',
    'P 2024-01-01 FUND 10\n',
  ];

  for (const sourceText of sources) {
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('rejects quoted and otherwise invalid commodity symbols', () => {
  const sources = [
    '2024-01-01 Quoted\n  Assets:Cash  1 "USD"\n  Equity:Opening\n',
    "2024-01-01 Quoted\n  Assets:Cash  1 'USD'\n  Equity:Opening\n",
    '2024-01-01 Operator\n  Assets:Cash  1 US@D\n  Equity:Opening\n',
    '2024-01-01 Operator\n  Assets:Cash  1 US=D\n  Equity:Opening\n',
    'commodity "USD"\n',
    'P 2024-01-01 "FUND" 1 USD\n',
  ];

  for (const sourceText of sources) {
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('allows trailing whitespace on a commodity directive without a comment', () => {
  const document = parseConformant('commodity USD   \n', 'fixture.ledger');

  assert.equal(document.entries[0].symbol, 'USD');
  assert.equal(document.entries[0].comment, null);
});

test('parses declarations, commodity properties, prices, and source notes', () => {
  const document = parseConformant(`account Assets:Cash
tag Source
commodity SEK ; Swedish krona
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
  assert.equal(document.entries[2].comment, 'Swedish krona');
  assert.deepEqual(document.entries[3].price, { quantity: '123.45', commodity: 'SEK' });
  assert.deepEqual(document.entries[4].notes[0], {
    text: 'Source: statement.csv:4',
    key: 'Source',
    value: 'statement.csv:4',
    tags: [{ name: 'Source', value: 'statement.csv:4' }],
    location: { source: 'fixture.ledger', line: 9, column: 3 },
  });
});

test('requires canonical commodity formats', () => {
  const document = parseConformant(`commodity SEK
  format 1,000.00 SEK
commodity BTC
  format 1000.00000000 BTC
commodity JPY
  format 1,000 JPY
`, 'fixture.ledger');

  assert.deepEqual(document.entries.map(({ symbol, properties }) => ({ symbol, format: properties[0].value })), [
    { symbol: 'SEK', format: '1,000.00 SEK' },
    { symbol: 'BTC', format: '1000.00000000 BTC' },
    { symbol: 'JPY', format: '1,000 JPY' },
  ]);

  for (const format of [
    'SEK 1,000.00',
    '1,000.00SEK',
    '1.000,00 SEK',
    '12,34.00 SEK',
    '999.00 SEK',
    '10,000.00 SEK',
    '10000.00 SEK',
    '1,000,000.00 SEK',
    '1,000.00 USD',
    '1,000.00 SEK trailing',
  ]) {
    const sourceText = `commodity SEK\n  format ${format}\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('allows top-level blank lines but rejects them within transaction and commodity bodies', () => {
  parseConformant(`2024-01-01 Opening
  Assets:Cash  1 SEK

commodity SEK
`, 'fixture.ledger');

  for (const sourceText of [
    '2024-01-01 Opening\n\n  Assets:Cash  1 SEK\n',
    '2024-01-01 Opening\n  Assets:Cash  1 SEK\n\n  Equity:Opening\n',
    'commodity SEK\n\n  format 1,000.00 SEK\n',
    'commodity SEK\n  format 1,000.00 SEK\n\n  default\n',
  ]) {
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
});

test('reports precise source locations for invalid input', () => {
  assert.throws(
    () => parse('2024-02-30 Invalid\n  Assets:Cash  1 SEK\n', { source: 'bad.ledger' }),
    (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX &&
      error.message === 'bad.ledger:1:1: Invalid date "2024-02-30"',
  );
  assert.throws(
    () => parse('2024-01-01 Invalid\n  Assets:Cash  one SEK\n', { source: 'bad.ledger' }),
    /bad\.ledger:2:\d+: Expected a number for posting amount/,
  );
});

test('rejects the alternative D default commodity directive', () => {
  assert.throws(
    () => parse('D 1,000.00 USD\n', { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX &&
      error.message === 'bad.ledger:1:1: Unsupported directive or transaction header "D"',
  );
  assert.throws(
    () => ohmParser.parse('D 1,000.00 USD\n', { source: 'bad.ledger' }),
  );
});

test('rejects values on default commodity properties', () => {
  const sourceText = 'commodity SEK\n  default SEK\n';
  assert.throws(
    () => parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX && /does not accept a value/u.test(error.message),
  );
  assert.throws(
    () => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX,
  );
});

test('rejects the unsupported nomarket commodity property consistently', () => {
  const sourceText = 'commodity SEK\n  nomarket\n';
  assert.throws(
    () => parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX && /commodity property/u.test(error.message),
  );
  assert.throws(
    () => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX,
  );
});
