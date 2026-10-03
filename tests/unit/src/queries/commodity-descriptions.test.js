'use strict';

const { resolveRepositoryModule } = require('../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openJournal } = resolveRepositoryModule('src/core/project.js');
const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-commodity-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
test.after(() => fs.rmSync(cacheDirectory, { recursive: true, force: true }));

test('returns consolidated commodity metadata in symbol order', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-commodity-descriptions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity FUND ; original
  format 1,000.0000 FUND
commodity USD ; dollars
  format 1,000.00 USD
  default
commodity FUND ; updated
`);

  assert.deepEqual(openJournal(journalPath).commodityDescriptions(), [
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
