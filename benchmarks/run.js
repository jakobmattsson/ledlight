'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  generateJournal, ACCOUNT_COUNT, TRANSACTION_COUNT, PRICE_COUNT, TRADE_COUNT,
} = require('./generate-journal');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-benchmark-'));
const journalPath = path.join(directory, 'synthetic.ledger');
const cacheDirectory = path.join(directory, 'cache');
process.env.LEDLIGHT_CACHE_HOME = cacheDirectory;
const { openJournal } = require('..');

function elapsedMilliseconds(operation) {
  const start = process.hrtime.bigint();
  const value = operation();
  const milliseconds = Number(process.hrtime.bigint() - start) / 1000000;
  return { value, milliseconds };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function verifyFixture(journal, aggregateRows) {
  assert.deepEqual(journal.warnings, []);
  const accounts = journal.accounts({ usage: 'all' });
  assert.equal(accounts.length, ACCOUNT_COUNT);
  assert.ok(accounts.every(({ used }) => used));
  const nonzeroAccounts = new Set(aggregateRows.map(({ account }) => account));
  assert.equal(ACCOUNT_COUNT - nonzeroAccounts.size, 55);

  const database = new Database(journal.databasePath, { readonly: true });
  try {
    const count = (table) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    assert.equal(count('transactions'), TRANSACTION_COUNT);
    assert.equal(count('postings'), 10400);
    assert.equal(count('prices'), PRICE_COUNT);
    assert.equal(count('transaction_tags'), 3650);
    const trades = database.prepare(`
      SELECT COUNT(DISTINCT transaction_id) AS count
      FROM postings WHERE amount_commodity LIKE 'UNIT%'
    `).get().count;
    assert.equal(trades, TRADE_COUNT);
  } finally {
    database.close();
  }
}

try {
  generateJournal(journalPath);
  const samples = { cold: [], warm: [], aggregate: [] };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
    const cold = elapsedMilliseconds(() => openJournal(journalPath));
    assert.equal(cold.value.rebuilt, true);
    samples.cold.push(cold.milliseconds);

    const warm = elapsedMilliseconds(() => openJournal(journalPath));
    assert.equal(warm.value.rebuilt, false);
    samples.warm.push(warm.milliseconds);

    const aggregate = elapsedMilliseconds(() => warm.value.aggregate({}));
    samples.aggregate.push(aggregate.milliseconds);
    if (iteration === 0) verifyFixture(warm.value, aggregate.value);
  }
  const results = [
    { name: 'Cold journal load', unit: 'ms', value: median(samples.cold) },
    { name: 'Cached journal load', unit: 'ms', value: median(samples.warm) },
    { name: 'Aggregate report', unit: 'ms', value: median(samples.aggregate) },
  ];
  if (process.argv[2]) fs.writeFileSync(process.argv[2], `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ results, samples }, null, 2)}\n`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
