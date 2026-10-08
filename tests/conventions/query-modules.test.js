'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery } = require('../support/repository-container');

const queryDirectory = path.resolve(__dirname, '../../src/surface/queries');

test('each query module is exposed through the query collection', () => {
  const queryFiles = fs.readdirSync(queryDirectory)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort();

  for (const fileName of queryFiles) {
    const expectedName = fileName.replace(/\.js$/u, '')
      .replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    const query = resolveQuery(expectedName);
    assert.deepEqual(Object.keys(query).sort(), ['execute', 'inputSchema', 'name']);
    assert.equal(query.name, expectedName);
    assert.equal(typeof query.inputSchema?.safeParse, 'function',
      `${fileName} must expose inputSchema`);
    assert.equal(typeof query.execute, 'function', `${fileName} must expose execute`);
    assert.equal(query.execute.length, 3,
      `${fileName} execute must accept database, options, and caches`);
    assert.ok(Object.isFrozen(query), `${fileName} must be immutable`);
  }
});
