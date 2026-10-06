'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseLedgerText } = require('../../../..');
const { resolveReferenceParser } = require('../../../support/repository-container');

const casesDirectory = path.resolve(__dirname, '../../../parser-cases');
const textHeader = '========== TEXT ==========\n';
const jsonHeader = '========== JSON ==========\n';
const parseWithOhm = resolveReferenceParser().$$private.parseStrict;

for (const name of fs.readdirSync(casesDirectory).filter((file) => file.endsWith('.case')).sort()) {
  test(name, () => {
    const contents = fs.readFileSync(path.join(casesDirectory, name), 'utf8');
    assert.ok(contents.startsWith(textHeader), 'case must start with a TEXT section');
    const separator = contents.indexOf(jsonHeader, textHeader.length);
    assert.ok(separator > textHeader.length, 'case must contain a nonempty TEXT section and a JSON section');
    assert.equal(contents.indexOf(jsonHeader, separator + jsonHeader.length), -1, 'case must have one JSON section');
    const sourceText = contents.slice(textHeader.length, separator);
    const expected = JSON.parse(contents.slice(separator + jsonHeader.length));
    assert.deepEqual(parseLedgerText(sourceText, { source: 'fixture.ledger' }), expected);
    assert.deepEqual(parseWithOhm(sourceText, { source: 'fixture.ledger' }), expected);
  });
}
