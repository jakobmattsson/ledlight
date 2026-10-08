'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase } = require('../../../support/case');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { warningCodes } = resolveRepositoryModule('src/impl/ingestion/ingestion-warning.js');
const directory = path.resolve(__dirname, '../../../api/queries/warnings');
// These guards require a parsed journal with a missing commodity. Journal text
// fails parsing first and produces SYNTAX_ERROR instead.
const internalWarningCodes = new Set([
  warningCodes.AMBIGUOUS_BALANCE_ASSIGNMENT,
  warningCodes.MISSING_COMMODITY,
]);
const exampleFiles = fs.readdirSync(directory).filter((name) => name.endsWith('.case'));

test('every user-facing warning code has exactly one named example', () => {
  const exampleCodes = exampleFiles.map((name) => name.slice(0, -'.case'.length));
  const userFacingWarningCodes = Object.values(warningCodes)
    .filter((code) => !internalWarningCodes.has(code));
  assert.deepEqual(exampleCodes.sort(), userFacingWarningCodes.sort());
  for (const name of exampleFiles) {
    const code = name.slice(0, -'.case'.length);
    const example = parseCase(path.join(directory, name));
    assert.match(example.warnings ?? '', new RegExp(`^\\[${code}\\]`, 'mu'), name);
  }
});
