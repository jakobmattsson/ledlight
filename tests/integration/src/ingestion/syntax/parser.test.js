'use strict';

const { resolveReferenceParser, resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { errorCodes } = resolveRepositoryModule("src/core/public-errors.js");
const runtimeParser = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const parseRecovering = runtimeParser.parse;
const parse = runtimeParser.$$private.parseStrict;
const referenceParser = resolveReferenceParser().$$private;
const ohmParser = { parse: referenceParser.parseStrict };

test('skips every malformed top-level block and continues parsing', () => {
  const sourceText = `account Assets:Declared
2024-01-01 Broken amount
  Assets:Cash  nope SEK
  Equity:Opening
commodity SEK
  format nonsense
account Equity:Declared
2024-01-02 Valid
  Assets:Cash  5 SEK
  Equity:Opening
P 2024-99-01 FUND 10 SEK
tag Imported
`;

  for (const parseDocument of [parseRecovering, referenceParser.parse]) {
    const document = parseDocument(sourceText, { source: 'fixture.ledger' });
    assert.deepEqual(document.entries.map((entry) => entry.type), [
      'account', 'account', 'transaction', 'tag',
    ]);
    assert.deepEqual(document.warnings.map(({ code, source, startLine, endLine }) => ({
      code, source, startLine, endLine,
    })), [
      { code: 'SYNTAX_ERROR', source: 'fixture.ledger', startLine: 2, endLine: 4 },
      { code: 'SYNTAX_ERROR', source: 'fixture.ledger', startLine: 5, endLine: 6 },
      { code: 'SYNTAX_ERROR', source: 'fixture.ledger', startLine: 11, endLine: 11 },
    ]);
  }
});

test('rejects other top-level comment markers', () => {
  for (const marker of ['#', '%', ':']) {
    const sourceText = `${marker} not a comment\n2024-01-01 Transaction\n  Assets:Cash  1 SEK\n  Equity:Opening\n`;
    assert.throws(() => parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
    assert.throws(() => ohmParser.parse(sourceText, { source: 'bad.ledger' }),
      (error) => error instanceof SyntaxError && error.code === errorCodes.SYNTAX);
  }
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

test('rejects noncanonical commodity formats', () => {
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

test('rejects blank lines within transaction and commodity bodies', () => {
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
