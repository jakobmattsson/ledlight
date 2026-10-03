'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertDateInterval,
  parseOptions,
} = resolveRepositoryModule('src/core/api-options.js');
const { z } = require('zod');

test('parses options with schema-provided defaults', () => {
  const schema = z.strictObject({ enabled: z.boolean().default(false) });
  assert.deepEqual(parseOptions(schema, undefined, 'example'), { enabled: false });
  assert.doesNotThrow(() => assertDateInterval('2024-01-01', '2024-12-31'));
});

test('rejects invalid options and date intervals', () => {
  const schema = z.strictObject({ enabled: z.boolean() });
  assert.throws(() => parseOptions(schema, { enabled: 'true' }, 'example'), /enabled/u);
  assert.throws(() => assertDateInterval('2024-02-30', undefined), /Invalid --from date/u);
  assert.throws(
    () => assertDateInterval('2024-02-01', '2024-01-01'),
    /--from date 2024-02-01 is after --to date 2024-01-01/u,
  );
});
