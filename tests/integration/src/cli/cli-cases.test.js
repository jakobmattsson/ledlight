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
    assert.deepEqual(runCase(expected), {
      stdout: expected.stdout,
      stderr: expected.stderr,
    });
  });
}
