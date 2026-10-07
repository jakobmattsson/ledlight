'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scriptsDirectory = path.resolve(__dirname, '../../../scripts');

test('scripts are grouped in subdirectories', () => {
  const rootFiles = fs.readdirSync(scriptsDirectory, { withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => entry.name);

  assert.deepEqual(rootFiles, [], 'Files must not be placed directly in scripts/');
});
