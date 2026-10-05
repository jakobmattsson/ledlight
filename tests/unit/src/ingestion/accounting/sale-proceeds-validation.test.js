'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { resolveRepositoryModule } = require('../../../../support/repository-container');
const { ensureDatabaseCurrent, $$private: { buildDatabase } } =
  resolveRepositoryModule('src/ingestion/database/database.js');

function fixture(t, sale, extra) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-proceeds-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const journalPath = path.join(directory, 'journal.ledger');
  const databasePath = path.join(directory, 'journal.sqlite');
  fs.writeFileSync(journalPath, `commodity USD
  format 1,000.00 USD
  default
commodity FUND
  format 1,000 FUND
account Holdings
account Bank
account Result
account Fees
account Other
P 2024-01-01 FUND 100 USD
2024-01-01 Purchase
  Holdings  10 FUND {100 USD}
  Bank  -1000 USD
2024-01-02 Sale
${sale}
${extra || ''}`);
  return { journalPath, databasePath, warnings: buildDatabase(databasePath, journalPath).warnings };
}

for (const annotation of ['@ 999 USD', '@@ 999 USD', '@ 119 USD', '@@ 121 USD']) {
  test(`warns about an unexplained sale price ${annotation}`, (t) => {
    const { warnings } = fixture(t, `  Holdings  -1 FUND {100 USD} ${annotation}
  Bank  120 USD
  Result  -20 USD`);
    assert.deepEqual(warnings.map(({ code }) => code), ['SALE_PROCEEDS_MISMATCH']);
    assert.match(warnings[0].message, /cannot be explained by the monetary postings/u);
    assert.equal(warnings[0].line, 15);
  });
}

for (const [name, sale] of [
  ['unit price', '  Holdings  -2 FUND {100 USD} @ 120 USD\n  Bank  240 USD\n  Result  -40 USD'],
  ['total price', '  Holdings  -2 FUND {100 USD} @@ 240 USD\n  Bank  240 USD\n  Result  -40 USD'],
  ['loss', '  Holdings  -1 FUND {100 USD} @ 80 USD\n  Bank  80 USD\n  Result  20 USD'],
  ['gross fees', '  Holdings  -1 FUND {100 USD} @ 120 USD\n  Bank  115 USD\n  Fees  5 USD\n  Result  -20 USD'],
  ['net fees', '  Holdings  -1 FUND {100 USD} @ 115 USD\n  Bank  115 USD\n  Result  -15 USD'],
  ['loss with fees', '  Holdings  -1 FUND {100 USD} @ 80 USD\n  Bank  75 USD\n  Fees  5 USD\n  Result  20 USD'],
  ['implicit result', '  Holdings  -1 FUND {100 USD} @ 120 USD\n  Bank  120 USD\n  Result'],
  ['worthless disposal', '  Holdings  -1 FUND {100 USD} @ 0 USD\n  Result  100 USD'],
  ['rounding', '  Holdings  -1 FUND {100 USD} @ 120.004 USD\n  Bank  120.00 USD\n  Result  -20.00 USD'],
  ['split settlement', '  Holdings  -1 FUND {100 USD} @ 120 USD\n  Bank  50 USD\n  Other  65 USD\n  Fees  5 USD\n  Result  -20 USD'],
  ['sale and purchase', '  Holdings  -2 FUND {100 USD} @ 120 USD\n  Holdings  1 FUND {110 USD}\n  Bank  130 USD\n  Result  -40 USD'],
  ['transfer', '  Holdings  -1 FUND {100 USD}\n  Other  1 FUND {100 USD}'],
]) {
  test(`accepts ${name} without inferring account roles from names`, (t) => {
    assert.deepEqual(fixture(t, sale).warnings, []);
  });
}

test('does not allow errors in different transactions to cancel', (t) => {
  const { warnings } = fixture(t, `  Holdings  -1 FUND {100 USD} @ 119 USD
  Bank  120 USD
  Result  -20 USD`, `2024-01-03 Another sale
  Holdings  -1 FUND {100 USD} @ 121 USD
  Bank  120 USD
  Result  -20 USD
`);
  assert.deepEqual(warnings.map(({ code }) => code), [
    'SALE_PROCEEDS_MISMATCH', 'SALE_PROCEEDS_MISMATCH',
  ]);
});

test('rebuilds cached diagnostics from before sale proceeds validation', (t) => {
  const { journalPath, databasePath } = fixture(t, `  Holdings  -1 FUND {100 USD} @ 999 USD
  Bank  120 USD
  Result  -20 USD`);
  const database = new Database(databasePath);
  try {
    database.prepare("UPDATE database_metadata SET value = '22' WHERE key = 'schema_version'").run();
    database.exec('DELETE FROM ingestion_warnings');
  } finally {
    database.close();
  }
  const result = ensureDatabaseCurrent(databasePath, journalPath);
  assert.equal(result.rebuilt, true);
  assert.deepEqual(result.summary.warnings.map(({ code }) => code), ['SALE_PROCEEDS_MISMATCH']);
});
