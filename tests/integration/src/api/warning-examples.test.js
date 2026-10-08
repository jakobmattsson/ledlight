'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase } = require('../../../support/case');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const { warningCodes } = resolveRepositoryModule('src/impl/ingestion/ingestion-warning.js');
const directory = path.resolve(__dirname, '../../../api/queries/warnings');
const exampleFiles = fs.readdirSync(directory).filter((name) =>
  name.endsWith('.case') || name.endsWith('.example.js'));

test('every warning code has exactly one named example', () => {
  const exampleCodes = exampleFiles.map((name) => name.replace(/(?:\.case|\.example\.js)$/u, ''));
  assert.deepEqual(exampleCodes.sort(), Object.values(warningCodes).sort());
  for (const name of exampleFiles.filter((file) => file.endsWith('.case'))) {
    const code = name.slice(0, -'.case'.length);
    const example = parseCase(path.join(directory, name));
    assert.match(example.warnings ?? '', new RegExp(`^\\[${code}\\]`, 'mu'), name);
  }
});

test('internal warning examples exercise their named warning', () => {
  for (const name of exampleFiles.filter((file) => file.endsWith('.example.js'))) {
    const code = name.slice(0, -'.example.js'.length);
    const { warnings, resolved, invalidEntries } = require(path.join(directory, name))();
    assert.deepEqual(warnings.map((warning) => warning.code), [code], name);
    assert.ok(warnings[0].message.length > 0, name);
    if (code === 'AMBIGUOUS_BALANCE_ASSIGNMENT') {
      assert.equal(resolved, null);
      assert.equal(warnings[0].message, 'Cannot infer balance assignment commodity');
    } else if (code === 'MISSING_COMMODITY') {
      assert.equal(invalidEntries.size, 1);
      assert.equal(warnings[0].message, 'Posting amount must specify a commodity');
    }
  }
});
