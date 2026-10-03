'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const queryDirectory = path.resolve(__dirname, '../../../../src/queries');

test('each query module exposes exactly one function and one schema', () => {
  const queryFiles = fs.readdirSync(queryDirectory)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort();

  for (const fileName of queryFiles) {
    const queryModule = resolveRepositoryModule(path.join(queryDirectory, fileName));
    const exports = Object.entries(queryModule);
    assert.equal(exports.length, 2, `${fileName} must expose exactly two members`);
    assert.equal(typeof queryModule.optionsSchema?.safeParse, 'function',
      `${fileName} must expose optionsSchema`);
    assert.equal(exports.filter(([, value]) => typeof value === 'function').length, 1,
      `${fileName} must expose exactly one function`);
  }
});
