'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');

test('the root README links to every file in docs', () => {
  const docsDirectory = path.join(repositoryRoot, 'docs');
  const documentationPaths = fs.readdirSync(docsDirectory, { recursive: true })
    .filter((relativePath) => fs.statSync(path.join(docsDirectory, relativePath)).isFile())
    .map((relativePath) => `docs/${relativePath.split(path.sep).join('/')}`);
  const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  const linkedPaths = new Set(
    [...readme.matchAll(/\]\((?:\.\/)?(docs\/[^)#]+)(?:#[^)]*)?\)/gu)]
      .map((match) => match[1]),
  );
  const unlinkedPaths = documentationPaths.filter((documentationPath) =>
    !linkedPaths.has(documentationPath));

  assert.deepEqual(unlinkedPaths, [], 'Every file in docs/ must be linked from README.md');
});
