'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const { dateOption, parseOptions } = resolveRepositoryModule('src/impl/core/api-options.js');
const { z } = require('zod');

test('parses options with schema-provided defaults', () => {
  const schema = z.strictObject({ enabled: z.boolean().default(false) });
  assert.deepEqual(parseOptions(schema, undefined, 'example'), { enabled: false });
});

test('rejects invalid options', () => {
  const schema = z.strictObject({ enabled: z.boolean() });
  assert.throws(() => parseOptions(schema, { enabled: 'true' }, 'example'), /enabled/u);
});

test('accepts ISO calendar dates but rejects Date objects and timestamps', () => {
  const schema = z.strictObject({ to: dateOption });
  assert.deepEqual(parseOptions(schema, { to: '2024-02-29' }, 'example'), {
    to: '2024-02-29',
  });
  assert.throws(() => parseOptions(schema, { to: new Date('2024-02-29') }, 'example'),
    /to must be a valid date in YYYY-MM-DD format/u);
  assert.throws(() => parseOptions(schema, { to: '2024-02-29T00:00:00Z' }, 'example'),
    /to must be a valid date in YYYY-MM-DD format/u);
});
