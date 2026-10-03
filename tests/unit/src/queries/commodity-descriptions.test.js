'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openProject } = resolveRepositoryModule('src/api/index.js');

test('returns consolidated commodity metadata in symbol order', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-commodity-descriptions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, '.ledgerrc'), '--file journal.ledger\n');
  fs.writeFileSync(path.join(directory, 'journal.ledger'), `commodity FUND ; original
  format 1,000.0000 FUND
commodity USD ; dollars
  format 1,000.00 USD
  default
commodity FUND ; updated
`);

  assert.deepEqual(openProject(directory).commodityDescriptions(), [
    {
      commodity: 'FUND',
      comment: 'updated',
      format: '1,000.0000 FUND',
      isDefault: false,
    },
    {
      commodity: 'USD',
      comment: 'dollars',
      format: '1,000.00 USD',
      isDefault: true,
    },
  ]);
});
