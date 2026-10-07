'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseLedgerText } = require('../../../..');
const { resolveReferenceParser, resolveRepositoryModule } = require('../../../support/repository-container');

const casesDirectory = path.resolve(__dirname, '../../../api/parser');
const textHeader = '\n\n========== TEXT ==========\n\n';
const jsonHeader = '\n========== JSON ==========\n\n';
const errorHeader = '\n========== ERROR ==========\n\n';
const warningsHeader = '\n========== WARNINGS ==========\n\n';
const runtimeParser = resolveRepositoryModule('src/impl/ingestion/syntax/ledger-parser.js');
const referenceParser = resolveReferenceParser().$$private;

function warningContract({ code, source, line, startLine, endLine }) {
  return { code, source, line, startLine, endLine };
}

for (const name of fs.readdirSync(casesDirectory).filter((file) => file.endsWith('.case')).sort()) {
  test(name, () => {
    const contents = fs.readFileSync(path.join(casesDirectory, name), 'utf8');
    const textSeparator = contents.indexOf(textHeader);
    assert.ok(textSeparator > 0 && contents.slice(0, textSeparator).trim() !== '',
      'case must start with a description and a TEXT section');
    const jsonSeparator = contents.indexOf(jsonHeader, textSeparator + textHeader.length);
    const errorSeparator = contents.indexOf(errorHeader, textSeparator + textHeader.length);
    const warningsSeparator = contents.indexOf(warningsHeader, textSeparator + textHeader.length);
    assert.ok((jsonSeparator >= 0) !== (errorSeparator >= 0),
      'case must have exactly one JSON or ERROR section');
    const separator = jsonSeparator >= 0 ? jsonSeparator : errorSeparator;
    assert.ok(separator > textSeparator + textHeader.length,
      'case must contain a nonempty TEXT section');
    const header = jsonSeparator >= 0 ? jsonHeader : errorHeader;
    assert.equal(contents.indexOf(header, separator + header.length), -1, 'case must have one result section');
    const sourceText = contents.slice(textSeparator + textHeader.length, separator);
    if (header === jsonHeader) {
      assert.ok(warningsSeparator < 0 || warningsSeparator > separator + header.length,
        'WARNINGS must follow a nonempty JSON section');
      const expected = JSON.parse(contents.slice(separator + header.length,
        warningsSeparator < 0 ? undefined : warningsSeparator));
      if (warningsSeparator < 0) {
        assert.deepEqual(parseLedgerText(sourceText, { source: 'fixture.ledger' }), expected);
        assert.deepEqual(referenceParser.parseStrict(sourceText, { source: 'fixture.ledger' }), expected);
      } else {
        assert.equal(contents.indexOf(warningsHeader, warningsSeparator + warningsHeader.length), -1,
          'case must have one WARNINGS section');
        const expectedWarnings = JSON.parse(contents.slice(warningsSeparator + warningsHeader.length));
        for (const parse of [runtimeParser.parse, referenceParser.parse]) {
          const { warnings, ...document } = parse(sourceText, { source: 'fixture.ledger' });
          assert.deepEqual(document, expected);
          assert.deepEqual((warnings || []).map(warningContract), expectedWarnings);
        }
      }
    } else {
      assert.equal(warningsSeparator, -1, 'ERROR cases cannot have WARNINGS');
      const expected = JSON.parse(contents.slice(separator + header.length));
      for (const parse of [parseLedgerText, referenceParser.parseStrict]) {
        assert.throws(() => parse(sourceText, { source: expected.source }), (error) => {
          assert.ok(error instanceof SyntaxError);
          for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value);
          return true;
        });
      }
    }
  });
}
