'use strict';

const { resolveRepositoryModule } = require('../../../../support/repository-container');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { queryGain } = resolveRepositoryModule('src/ledlight/queries/gain.js');
const { buildDatabase } = resolveRepositoryModule('src/ledlight/sqlite/database.js').$$private;

function buildFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-gain-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  default
P 2024-01-01 AAPL 100 USD
P 2024-01-01 BOND 50 USD
P 2024-01-01 ETF 50 USD
P 2024-02-01 AAPL 120 USD
P 2024-02-01 BOND 40 USD
P 2024-02-01 ETF 60 USD

2024-01-01 Buy shares
  Assets:Broker  10 AAPL {100 USD}
  Assets:Bank  -1000 USD

2024-01-01 Buy ETF
  Assets:Broker  1 ETF {50 USD}
  Assets:Bank  -50 USD

2024-01-01 Buy bonds
  Assets:Bonds  2 BOND {{100 USD}}
  Assets:Bank  -100 USD

2024-02-02 Partial share sale
  Assets:Broker  -4 AAPL {100 USD} @ 130 USD
  Assets:Bank  520 USD
  Income:Capital Gains  -120 USD
`);
  buildDatabase(databasePath, journalPath);
  return databasePath;
}

function gainReport(databasePath, options) {
  return queryGain(databasePath, options, { valuationPriceCache: new Map() });
}

test('returns unrealized gains and losses by account in the default commodity', (t) => {
  assert.deepEqual(gainReport(buildFixture(t), {}), [
    { account: 'Assets:Bonds', quantity: '-20', commodity: 'USD' },
    { account: 'Assets:Broker', quantity: '130', commodity: 'USD' },
  ]);
});

test('uses the report date for positions, prices, and account selection', (t) => {
  const databasePath = buildFixture(t);
  assert.deepEqual(gainReport(databasePath, { to: '2024-01-31' }), []);
  assert.deepEqual(gainReport(databasePath, { accounts: ['Assets:Bonds'] }), [
    { account: 'Assets:Bonds', quantity: '-20', commodity: 'USD' },
  ]);
});

test('rejects unsupported gain report options and invalid dates', (t) => {
  const databasePath = buildFixture(t);
  assert.throws(() => gainReport(databasePath, { from: '2024-01-01' }),
    /Unknown gainReport option: from/u);
  assert.throws(() => gainReport(databasePath, { to: '2024-02-30' }),
    /Invalid --to date/u);
});
