'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseCase, runCase } = require('../../support/case');

const directory = path.resolve(__dirname, '../../api/queries');
const fixtureCache = new Map();
test.after(() => {
  for (const fixtureDirectory of fixtureCache.values()) {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

function listCases(caseDirectory) {
  return fs.readdirSync(caseDirectory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(caseDirectory, entry.name);
    if (entry.isDirectory()) return listCases(fullPath);
    return entry.isFile() && entry.name.endsWith('.case') ? [fullPath] : [];
  });
}

for (const fileName of listCases(directory).sort()) {
  const caseName = path.relative(directory, fileName).split(path.sep).join('/');
  test(caseName, () => {
    const expected = parseCase(fileName);
    const { actual, journalPath, temporaryDirectory } = runCase(expected, fixtureCache);
    const resolvePaths = (value) => value
      ?.replaceAll('{{JOURNAL_PATH}}', journalPath)
      .replace(/\{\{FILE:([^}]+)\}\}/gu, (_match, name) => path.join(temporaryDirectory, name));
    for (const [name, result] of Object.entries(actual)) {
      if (expected.output !== undefined) {
        assert.equal(result.output, resolvePaths(expected.output), `${name} OUTPUT`);
      }
      if (expected.warnings !== undefined) {
        assert.equal(result.warnings, resolvePaths(expected.warnings), `${name} WARNINGS`);
      }
      assert.equal(result.error, resolvePaths(expected.error) ?? '', `${name} ERROR`);
      if (name === 'cli' || name === 'ledgerCli') {
        assert.equal(result.exitCode, expected.error === undefined ? 0 : 1);
      }
    }
  });
}
