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
    if (expected.stdout !== undefined) assert.equal(actual.stdout, expected.stdout);
    if (expected.stderr !== undefined) assert.equal(actual.stderr, expected.stderr);
    if (expected.api && expected.arguments_) {
      assert.deepEqual(presentedApiResult(expected, actual.apiResult), JSON.parse(actual.stdout));
    }
  });
}
