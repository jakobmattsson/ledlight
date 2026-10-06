'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase, runCase } = require('../../../support/cli-case');

const directory = path.resolve(__dirname, '../../../cases/cli');

for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith('.case')).sort()) {
  test(fileName, () => {
    const expected = parseCase(path.join(directory, fileName));
    const actual = runCase(expected);
    for (const [name, result] of Object.entries(actual)) {
      if (expected.output !== undefined) assert.equal(result.output, expected.output, `${name} OUTPUT`);
      if (expected.warnings !== undefined) {
        assert.equal(result.warnings, expected.warnings, `${name} WARNINGS`);
      }
      assert.equal(result.error, expected.error ?? '', `${name} ERROR`);
      if (name === 'cli') assert.equal(result.exitCode, expected.error === undefined ? 0 : 1);
    }
  });
}
