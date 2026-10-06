'use strict';

const { resolveReferenceParser, resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const test = require('node:test');
const { errorCodes } = resolveRepositoryModule("src/core/public-errors.js");
const runtimeParser = resolveRepositoryModule("src/ingestion/syntax/ledger-parser.js");
const parseRecovering = runtimeParser.parse;
const parse = runtimeParser.$$private.parseStrict;
const referenceParser = resolveReferenceParser().$$private;

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

test('rejects unsupported auxiliary transaction dates', () => {
  const sourceText = '2024-01-01=2024-01-02 Trade\n  Assets:Cash  1 SEK\n  Equity:Opening\n';
  assert.throws(() => parse(sourceText, { source: 'fixture.ledger' }), /Expected whitespace after transaction date/u);
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
});

test('rejects values on default commodity properties', () => {
  const sourceText = 'commodity SEK\n  default SEK\n';
  assert.throws(
    () => parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX && /does not accept a value/u.test(error.message),
  );
});

test('rejects the unsupported nomarket commodity property consistently', () => {
  const sourceText = 'commodity SEK\n  nomarket\n';
  assert.throws(
    () => parse(sourceText, { source: 'bad.ledger' }),
    (error) => error.code === errorCodes.SYNTAX && /commodity property/u.test(error.message),
  );
});
