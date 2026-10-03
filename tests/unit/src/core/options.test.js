'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseOptions } = resolveRepositoryModule('src/core/api-options.js');
const { z } = require('zod');

test('parses options with schema-provided defaults', () => {
  const schema = z.strictObject({ enabled: z.boolean().default(false) });
  assert.deepEqual(parseOptions(schema, undefined, 'example'), { enabled: false });
});

test('rejects invalid options', () => {
  const schema = z.strictObject({ enabled: z.boolean() });
  assert.throws(() => parseOptions(schema, { enabled: 'true' }, 'example'), /enabled/u);
});
