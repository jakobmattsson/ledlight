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
const errorHeader = '========== ERROR ==========\n';
const parseWithOhm = resolveReferenceParser().$$private.parseStrict;

for (const name of fs.readdirSync(casesDirectory).filter((file) => file.endsWith('.case')).sort()) {
  test(name, () => {
    const contents = fs.readFileSync(path.join(casesDirectory, name), 'utf8');
    assert.ok(contents.startsWith(textHeader), 'case must start with a TEXT section');
    const jsonSeparator = contents.indexOf(jsonHeader, textHeader.length);
    const errorSeparator = contents.indexOf(errorHeader, textHeader.length);
    assert.ok((jsonSeparator >= 0) !== (errorSeparator >= 0),
      'case must have exactly one JSON or ERROR section');
    const separator = jsonSeparator >= 0 ? jsonSeparator : errorSeparator;
    assert.ok(separator > textHeader.length, 'case must contain a nonempty TEXT section');
    const header = jsonSeparator >= 0 ? jsonHeader : errorHeader;
    assert.equal(contents.indexOf(header, separator + header.length), -1, 'case must have one result section');
    const sourceText = contents.slice(textHeader.length, separator);
    const expected = JSON.parse(contents.slice(separator + header.length));
    if (header === jsonHeader) {
      assert.deepEqual(parseLedgerText(sourceText, { source: 'fixture.ledger' }), expected);
      assert.deepEqual(parseWithOhm(sourceText, { source: 'fixture.ledger' }), expected);
    } else {
      for (const parse of [parseLedgerText, parseWithOhm]) {
        assert.throws(() => parse(sourceText, { source: expected.source }), (error) => {
          assert.ok(error instanceof SyntaxError);
          for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value);
          return true;
        });
      }
    }
  });
}
