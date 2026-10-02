'use strict';

const { resolveRepositoryModule } = require('../../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertDateInterval,
  booleanOption,
  dateBasis,
  knownOptions,
  stringList,
} = resolveRepositoryModule('src/ledlight/reports/options.js');

test('normalizes shared report options without mutating caller values', () => {
  const input = { accounts: ['Assets:', 'Assets:'], invert: true };
  assert.equal(knownOptions(input, ['accounts', 'invert'], 'report'), input);
  assert.deepEqual(stringList(input.accounts, 'accounts', true), ['Assets:']);
  assert.deepEqual(input.accounts, ['Assets:', 'Assets:']);
  assert.equal(booleanOption(input, 'invert'), true);
  assert.equal(booleanOption(input, 'missing'), false);
  assert.equal(dateBasis(undefined), 'posting');
  assert.doesNotThrow(() => assertDateInterval('2024-01-01', '2024-12-31'));
});

test('rejects invalid containers, unknown options, and incorrect primitive types', () => {
  assert.throws(() => knownOptions([], [], 'report'), /options must be an object/u);
  assert.throws(() => knownOptions({ typo: true }, [], 'report'), /Unknown report option: typo/u);
  assert.throws(() => booleanOption({ invert: 'true' }, 'invert'), /invert must be a boolean/u);
  assert.throws(() => stringList('Assets:', 'accounts', false), /accounts must be an array/u);
  assert.throws(() => dateBasis('actual'), /Invalid dateBasis/u);
  assert.throws(() => assertDateInterval('2024-02-30', undefined), /Invalid --from date/u);
  assert.throws(
    () => assertDateInterval('2024-02-01', '2024-01-01'),
    /--from date 2024-02-01 is after --to date 2024-01-01/u,
  );
});
