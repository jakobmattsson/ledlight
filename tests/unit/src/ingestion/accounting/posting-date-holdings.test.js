'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createRepositoryContainer } = require('../../../../../src/composition/repository-container');
const { asValue } = require('awilix');

const source = `commodity SEK
  format 1,000.00 SEK
  default
commodity FUND
  format 1,000.000 FUND
account Assets:Cash
account Assets:Fund

2024-01-01 Buy fund
  Assets:Fund  1 FUND {100 SEK} ; [2024-01-03]
  Assets:Cash  -100 SEK

2024-01-02 Sell fund
  Assets:Fund  -1 FUND {100 SEK} @ 100 SEK
  Assets:Cash  100 SEK
`;

function openFixture(t, text) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-posting-date-holdings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, text);
  const container = createRepositoryContainer();
  container.register('processEnvironment', asValue({ LEDLIGHT_CACHE_HOME: path.join(directory, 'cache') }));
  return container.resolve('project').openJournal(journalPath);
}

test('warns for the exact delayed-purchase journal while keeping both report timelines available', (t) => {
  const journal = openFixture(t, source);
  assert.deepEqual(journal.warnings, [{
    code: 'NEGATIVE_POSTING_DATE_HOLDING',
    message: 'Assets:Fund: holding is -1 FUND on 2024-01-02 using posting dates; ' +
      'disposals must not precede available acquisitions',
    instances: [{
      source: journal.journalPath,
      line: 14,
      column: 3,
      startLine: 14,
      endLine: 14,
    }],
  }]);
  const options = { accounts: ['^Assets:Fund$'], to: '2024-01-02' };
  assert.deepEqual(journal.aggregate(options), [
    { account: 'Assets:Fund', commodity: 'FUND', quantity: '-1' },
  ]);
  assert.deepEqual(journal.aggregate({ ...options, dateBasis: 'transaction' }), []);
});

for (const date of ['2024-01-03', '2024-01-04']) {
  test(`allows the sale posting on ${date} while preserving its January 2 transaction date`, (t) => {
    const journal = openFixture(t, source.replace('@ 100 SEK', `@ 100 SEK ; [${date}]`));
    assert.deepEqual(journal.warnings, []);
    assert.deepEqual(journal.aggregate({ accounts: ['^Assets:Fund$'], to: '2024-01-02' }), []);
  });
}

test('does not let another account cover an unavailable holding', (t) => {
  const journal = openFixture(t, source.replace('account Assets:Fund\n',
    'account Assets:Fund\naccount Assets:Other\n') + `
2024-01-01 Other account purchase
  Assets:Other  1 FUND {100 SEK}
  Assets:Cash  -100 SEK
`);
  assert.deepEqual(journal.warnings.map(({ code }) => code), ['NEGATIVE_POSTING_DATE_HOLDING']);
});

test('nets same-day posting movements even when transaction order puts the disposal first', (t) => {
  const journal = openFixture(t, source
    .replace('2024-01-01 Buy fund', '2024-01-04 Buy fund')
    .replace('@ 100 SEK', '@ 100 SEK ; [2024-01-03]'));
  assert.deepEqual(journal.warnings.map(({ code }) => code), ['IMPOSSIBLE_COST_BASIS']);
});
