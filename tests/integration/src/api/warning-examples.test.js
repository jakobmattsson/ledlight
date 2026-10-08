'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase } = require('../../../support/case');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { warningCodes } = resolveRepositoryModule('src/impl/ingestion/ingestion-warning.js');
const directory = path.resolve(__dirname, '../../../api/queries/warnings');
const exampleFiles = fs.readdirSync(directory).filter((name) => name.endsWith('.case'));

test('every warning code has exactly one named example', () => {
  const exampleCodes = exampleFiles.map((name) => name.slice(0, -'.case'.length));
  assert.deepEqual(exampleCodes.sort(), Object.values(warningCodes).sort());
  for (const name of exampleFiles) {
    const code = name.slice(0, -'.case'.length);
    const example = parseCase(path.join(directory, name));
    assert.match(example.warnings ?? '', new RegExp(`^\\[${code}\\]`, 'mu'), name);
  }
});
