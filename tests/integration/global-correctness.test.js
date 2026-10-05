'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery, resolveRepositoryModule } = require('../support/repository-container');

const { buildDatabase } = resolveRepositoryModule('src/ingestion/database/database.js').$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');
const { addDecimals, subtractDecimals, parseDecimal, formatDecimal } =
  resolveRepositoryModule('src/core/decimal.js');
const fixtures = path.resolve(__dirname, '../fixtures/global-correctness');

function sum(values) {
  return formatDecimal(values.reduce(
    (total, value) => addDecimals(total, parseDecimal(value)), parseDecimal('0'),
  ));
}

function subtract(left, right) {
  return formatDecimal(subtractDecimals(parseDecimal(left), parseDecimal(right)));
}

for (const name of fs.readdirSync(fixtures).filter((name) =>
  fs.statSync(path.join(fixtures, name)).isDirectory()).sort()) {
  const expected = JSON.parse(fs.readFileSync(path.join(fixtures, name, 'expected.json'), 'utf8'));

  test(`global correctness fixture: ${name}`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-global-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const journalPath = path.join(directory, 'journal.ledger');
    const databasePath = path.join(directory, 'journal.sqlite');
    fs.copyFileSync(path.join(fixtures, name, 'journal.ledger'), journalPath);
    const build = buildDatabase(databasePath, journalPath);
    assert.deepEqual(build.warnings.map(({ code }) => code), expected.currentIngestionWarningCodes);
    if (expected.currentIngestionWarningCodes.length > 0 &&
        expected.snapshots.every(({ status }) => status === 'balanced')) {
      await t.test('recognize the non-sale adjustment without a trade warning', {
        todo: 'Transfers and splits currently trigger INVALID_COMMODITY_TRADE despite preserving basis.',
      });
    }

    function query(name, options) {
      return readDatabase(databasePath, (database) => resolveQuery(name).execute(
        database, options, { valuationPriceCache: new Map() },
      ));
    }

    for (const snapshot of expected.snapshots) {
      await t.test(snapshot.at, async (t) => {
        const { positions, flows, unrealizedGains: report } = snapshot;
        const options = { at: snapshot.at };
        assert.ok(['balanced', 'invalid', 'incomplete'].includes(snapshot.status));
        assert.equal(snapshot.issues.length === 0, snapshot.status === 'balanced');

        // These are hand-authored expectations, never snapshots of Ledger output.
        for (const position of positions) {
          if (position.costBasis !== null && position.marketValue !== null) {
            assert.equal(position.unrealizedGain, subtract(position.marketValue, position.costBasis));
          }
        }
        assert.equal(snapshot.netRealizedGain, subtract(snapshot.bookedRealizedGain, flows.expensedFees));
        if (snapshot.unrealizedGain !== null) {
          assert.equal(snapshot.unrealizedGain, sum(positions.map((position) => position.unrealizedGain)));
        }
        if (snapshot.economicGain !== null) {
          assert.equal(snapshot.economicGain, subtract(
            sum([flows.saleProceeds, ...positions.map((position) => position.marketValue)]),
            sum([flows.purchaseCost, flows.expensedFees]),
          ));
        }
        if (snapshot.resultDifference !== null) {
          assert.equal(snapshot.resultDifference, subtract(
            sum([snapshot.netRealizedGain, snapshot.unrealizedGain]), snapshot.economicGain,
          ));
        }

        const quantities = query('summary', { accounts: ['Assets:Broker', 'Assets:OtherBroker'], to: snapshot.at });
        assert.deepEqual(quantities, positions.filter(({ quantity }) => quantity !== '0')
          .map(({ account, commodity, quantity }) => ({ account, commodity, quantity })));

        const money = (account) => sum(query('summary', { accounts: [account], to: snapshot.at })
          .map(({ quantity }) => quantity));
        assert.equal(money('Assets:Bank'), subtract(flows.saleProceeds, sum([flows.purchaseCost, flows.expensedFees])));
        assert.equal(money('Income:CapitalGains'), subtract('0', snapshot.bookedRealizedGain));
        assert.equal(money('Expenses:Fees'), flows.expensedFees);

        if (report.rows) {
          assert.deepEqual(query('unrealizedGains', options), report.rows);
        } else if (report.errorIncludes) {
          assert.throws(() => query('unrealizedGains', options), (error) =>
            error.message.includes(report.errorIncludes));
        } else {
          assert.equal(typeof report.pending, 'string');
          await t.test('unrealized-gains must expose the accounting error', { todo: report.pending });
        }
        for (const scoped of snapshot.accountReports || []) {
          assert.deepEqual(query('unrealizedGains', { ...options, accounts: scoped.accounts }), scoped.rows);
        }
        if (snapshot.issues.length > 0) {
          await t.test('global reconciliation diagnostics', {
            todo: 'The issue meanings in expected.json specify future validation; no global validation API exists yet.',
          });
        }
      });
    }
  });
}
