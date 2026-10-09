'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runCase } = require('../../../../support/case');

const declarations = `commodity SEK
  format 1,000.00 SEK
commodity NEW
  format 1,000.000000 NEW
commodity OLD
  format 1,000.0000 OLD
account Assets:Shares
`;

for (const [name, incomingPrice, outgoingPrice, balanced] of [
  ['neither side priced', '', '', true],
  ['both sides priced', '@@ 350 SEK', '@@ 350 SEK', true],
  ['only incoming side priced', '@@ 350 SEK', '', false],
  ['only outgoing side priced', '', '@@ 350 SEK', false],
]) {
  test(`public API balance warning for replacement with ${name}`, () => {
    const file = `${declarations}2022-12-12 Replacement
  Assets:Shares  4.051281 NEW {{350 SEK}} ${incomingPrice}
  Assets:Shares  -1.9619 OLD {{350 SEK}} ${outgoingPrice}
`;
    const { actual } = runCase({ file, files: {}, api: { method: 'aggregate', args: [] } });
    assert.equal(actual.api.error, '');
    assert.equal(actual.api.warnings.includes('[UNBALANCED_TRANSACTION]'), !balanced);
  });
}
