'use strict';

const { resolveRepositoryModule } = require('../../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const { errorCodes } = resolveRepositoryModule('src/core/public-errors.js');
const parse = resolveRepositoryModule('src/ingestion/syntax/ledger-parser.js').$$private.parseStrict;

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
