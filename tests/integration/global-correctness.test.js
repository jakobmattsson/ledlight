'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveQuery, resolveRepositoryModule } = require('../support/repository-container');

const { buildDatabase } = resolveRepositoryModule('src/ingestion/database/database.js').$$private;
const { readDatabase } = resolveRepositoryModule('src/ingestion/database/database-reader.js');
const { addDecimals, subtractDecimals, multiplyDecimals, compareDecimals, parseDecimal, formatDecimal } =
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

function multiply(left, right) {
  return formatDecimal(multiplyDecimals(parseDecimal(left), parseDecimal(right)));
}

function compare(left, right) {
  return compareDecimals(parseDecimal(left), parseDecimal(right));
}

function postingBasis(posting) {
  return posting.lotCost.isTotal
    ? posting.lotCost.quantity
    : multiply(posting.amount.quantity.replace(/^-/, ''), posting.lotCost.quantity);
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

    if (expected.costBasisChecks) {
      const postings = query('postings', {});
      for (const check of expected.costBasisChecks) {
        const matches = postings.filter((posting) => posting.description === check.transaction &&
          posting.account === check.account && posting.amount?.commodity === check.commodity);
        assert.equal(matches.length, 1, `Unique disposal for ${check.transaction}`);
        const [posting] = matches;
        assert.equal(posting.amount.quantity, subtract('0', check.quantity));
        assert.equal(posting.lotCost.commodity, expected.valuationCommodity);
        assert.equal(postingBasis(posting), check.costBasis);
        assert.ok(compare(check.minimum, check.maximum) <= 0);
        const inside = compare(check.costBasis, check.minimum) >= 0 &&
          compare(check.costBasis, check.maximum) <= 0;
        assert.equal(check.outcome, inside ? 'feasible' : 'infeasible');
        assert.ok(check.explanation.length > 0);
        await t.test(`${check.outcome}: ${check.transaction}, basis ${check.costBasis}, allowed ` +
          `[${check.minimum}, ${check.maximum}]`, {
          todo: 'Specification for the future allocation validator; bounds are hand-derived, not computed by Ledlight.',
        });
      }

      // Check supplied existence witnesses without implementing a search or bounds solver.
      for (const witness of expected.allocationWitnesses || []) {
        const purchases = witness.purchases.map((purchase) => {
          const matches = postings.filter((posting) => posting.description === purchase.transaction &&
            posting.account === 'Assets:Broker' && posting.amount?.commodity === 'FUND');
          assert.equal(matches.length, 1);
          const [posting] = matches;
          assert.equal(posting.amount.quantity, purchase.quantity);
          assert.equal(postingBasis(posting), multiply(purchase.quantity, purchase.unitCost));
          return { ...purchase, postingIndex: postings.indexOf(posting), consumed: '0' };
        });
        for (const sale of witness.sales) {
          const check = expected.costBasisChecks.find(({ transaction }) => transaction === sale.transaction);
          assert.ok(check, `Witness disposal ${sale.transaction} has an expected constraint`);
          assert.equal(sale.allocations.length, purchases.length);
          assert.equal(sum(sale.allocations), check.quantity);
          assert.equal(sum(sale.allocations.map((quantity, index) =>
            multiply(quantity, purchases[index].unitCost))), check.costBasis);
          const saleIndex = postings.findIndex((posting) => posting.description === sale.transaction &&
            posting.account === check.account);
          for (const [index, quantity] of sale.allocations.entries()) {
            const purchase = purchases[index];
            assert.ok(compare(quantity, '0') >= 0);
            if (compare(quantity, '0') > 0) assert.ok(purchase.postingIndex < saleIndex);
            purchase.consumed = sum([purchase.consumed, quantity]);
            assert.ok(compare(purchase.consumed, purchase.quantity) <= 0);
          }
        }
      }
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
