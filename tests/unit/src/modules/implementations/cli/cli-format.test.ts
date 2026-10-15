'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveRepositoryModule } = require('../../../../../support/repository-container');
const { formatWarnings } = resolveRepositoryModule('src/modules/implementations/cli/cli-format.js');

test('formats grouped warnings for a terminal', () => {
  assert.equal(formatWarnings([]), '');
  assert.equal(formatWarnings([{
    code: 'SYNTAX_ERROR',
    message: 'Expected a posting',
    instances: [{
      source: '/books/main.ledger',
      line: 12,
      column: 3,
      startLine: 10,
      endLine: 13,
    }, {
      source: '/books/included.ledger',
      line: 4,
      column: null,
      startLine: 4,
      endLine: 4,
    }],
  }]), '[SYNTAX_ERROR] Expected a posting\n' +
    '  /books/main.ledger:12:3 (affected lines 10-13)\n' +
    '  /books/included.ledger:4\n');
});
