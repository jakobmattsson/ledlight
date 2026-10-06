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
    const { actual, journalPath, temporaryDirectory } = runCase(expected);
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
