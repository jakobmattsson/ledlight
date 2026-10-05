'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { openJournal } = resolveRepositoryModule('src/core/project.js');
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-rounding-cache-'));
process.env.LEDLIGHT_CACHE_HOME = cache;
test.after(() => fs.rmSync(cache, { recursive: true, force: true }));

function fixture(t, options) {
  const { format, cost, bought, sold, basis, gain } = {
    format: '1,000.00', cost: '{{0.34 USD}}', bought: '3', sold: '1', basis: '1', gain: '', ...options,
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-rounding-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, `commodity USD
${format ? `  format ${format} USD\n` : ''}  default
commodity FUND
  format 1,000 FUND
account Assets:Broker
account Assets:Cash
account Income:Gains
P 2024-01-01 FUND 1 USD

2024-01-01 Purchase
  Assets:Broker  ${bought} FUND {{${basis} USD}}
  Assets:Cash  -${basis} USD

2024-02-01 Sale
  Assets:Broker  -${sold} FUND ${cost} @@ 1 USD
  Assets:Cash  1 USD
  Income:Gains  ${gain}
`);
  return openJournal(journalPath);
}

for (const format of ['1,000.00', '1000.00']) {
  test(`uses cost currency format ${format}, independently of whole-unit security precision`, (t) => {
    const journal = fixture(t, { format });
    assert.deepEqual(journal.warnings, []);
    assert.deepEqual(journal.unrealizedGains({}), [
      { account: 'Assets:Broker', quantity: '1.34', commodity: 'USD' },
    ]);
    assert.deepEqual(openJournal(journal.journalPath).warnings, []);
  });
}

for (const [format, cost, accepted] of [
  ['1,000.000', '0.334', true],
  ['1,000.000', '0.34', false],
  ['1,000', '1', true],
  ['1,000', '0.34', false],
  ['1,000.00', '0.333', false],
  ['1,000.00', '0.3300', true],
  [null, '0.34', false],
]) {
  test(`validates cost ${cost} with declared format ${format}`, (t) => {
    const journal = fixture(t, { format, cost: `{{${cost} USD}}` });
    assert.equal(journal.warnings.some(({ code }) => code === 'IMPOSSIBLE_COST_BASIS'), !accepted);
    assert.equal(journal.warnings.some(({ code }) => code === 'MISSING_COMMODITY_FORMAT'), !format);
  });
}

test('applies the monetary step to total basis, not separately to each sold unit', (t) => {
  const journal = fixture(t, { bought: '6', basis: '2', sold: '3', cost: '{0.33 USD}', gain: '-0.01 USD' });
  assert.deepEqual(journal.warnings.map(({ code }) => code), ['IMPOSSIBLE_COST_BASIS']);
  assert.match(journal.warnings[0].message, /cost 0\.99 USD; allowed range is 1 to 1 USD/u);
});

test('keeps an explicitly finer exact cost valid when supported by acquisitions', (t) => {
  const journal = fixture(t, { bought: '2', basis: '0.666', cost: '{{0.333 USD}}' });
  assert.deepEqual(journal.warnings, []);
});

test('rebuilds cached diagnostics from before commodity rounding was supported', (t) => {
  const journal = fixture(t, {});
  const database = new Database(journal.databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '21' WHERE key = 'schema_version'").run();
    database.exec(`INSERT INTO ingestion_warnings (position, code, message, source, line, column, start_line, end_line)
      VALUES (0, 'IMPOSSIBLE_COST_BASIS', 'Old exact-only warning', 'journal.ledger', 1, 1, 1, 1)`);
  } finally {
    database.close();
  }
  assert.deepEqual(openJournal(journal.journalPath).warnings, []);
});
