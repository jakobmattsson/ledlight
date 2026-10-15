'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const unitSourceRoot = path.join(repositoryRoot, 'tests/unit/src');
const sourceRoot = path.join(repositoryRoot, 'src');

function testFilesIn(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: import('node:fs').Dirent) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFilesIn(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [entryPath] : [];
  });
}

test('each source unit test matches a source file at the same relative path', () => {
  const missingSources = testFilesIn(unitSourceRoot)
    .map((testFile) => path.relative(unitSourceRoot, testFile).replace(/\.test\.ts$/u, '.ts'))
    .filter((relativePath) => !fs.existsSync(path.join(sourceRoot, relativePath)))
    .sort();

  assert.deepEqual(missingSources, [], 'Unit tests without matching source files');
});
