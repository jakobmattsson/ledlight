'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase, runCase } = require('../../../support/cli-case');

const directory = path.resolve(__dirname, '../../../cases/cli');

function presentedApiResult(expected, result) {
  if (expected.arguments_[0] === 'tags') return result.map(({ tag }) => tag);
  if (!expected.arguments_.includes('--details') && expected.arguments_[0] === 'accounts') {
    return result.map(({ account }) => account);
  }
  if (!expected.arguments_.includes('--details') && expected.arguments_[0] === 'commodities') {
    return result.map(({ commodity }) => commodity);
  }
  return result;
}

for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith('.case')).sort()) {
  test(fileName, () => {
    const expected = parseCase(path.join(directory, fileName));
    const actual = runCase(expected);
    if (expected.output !== undefined) assert.equal(actual.output, expected.output);
    if (expected.warnings !== undefined) assert.equal(actual.warnings, expected.warnings);
    assert.equal(actual.error, expected.error ?? '');
    if (expected.arguments_) assert.equal(actual.cliExitCode, expected.error === undefined ? 0 : 1);
    if (expected.api && expected.arguments_) {
      if (expected.error !== undefined) assert.equal(actual.apiError, expected.error);
      else {
        assert.equal(actual.apiError, undefined);
        assert.deepEqual(presentedApiResult(expected, actual.apiResult), JSON.parse(actual.output));
      }
    }
    if (expected.api && !expected.arguments_) {
      assert.equal(actual.apiError, expected.error);
    }
  });
}
