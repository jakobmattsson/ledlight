'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const buildRoot = path.join(repositoryRoot, 'dist');

function filesIn(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: import('node:fs').Dirent) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

test('compiled JavaScript stays in dist and mirrors the TypeScript sources', () => {
  const sourceFiles = [path.join(repositoryRoot, 'eslint.config.ts'),
    ...['src', 'lib', 'scripts', 'tests'].flatMap((directory) => filesIn(path.join(repositoryRoot, directory)))];
  assert.deepEqual(sourceFiles.filter((fileName) => /\.(?:js|d\.ts)$/u.test(fileName)), []);

  const expected = sourceFiles.filter((fileName) => fileName.endsWith('.ts'))
    .map((fileName) => path.relative(repositoryRoot, fileName).replace(/\.ts$/u, '.js')).sort();
  const actual = filesIn(buildRoot).filter((fileName) => fileName.endsWith('.js'))
    .map((fileName) => path.relative(buildRoot, fileName)).sort();
  assert.deepEqual(actual, expected);
});
