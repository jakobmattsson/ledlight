'use strict';

module.exports = ({
  fs,
  path,
}) => {

  const SCHEMA_VERSION = '12';
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  function migrateDatabase(database) {
    database.exec(schema);
    const existingVersion = database.prepare(
      "SELECT value FROM metadata WHERE key = 'schema_version'",
    ).pluck().get();
    if (existingVersion !== undefined && ![
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', SCHEMA_VERSION,
    ].includes(existingVersion)) {
      throw new Error(`Unsupported Ledlight database schema version: ${existingVersion}`);
    }
    const transactionColumns = database.pragma('table_info(transactions)').map((column) => column.name);
    if (transactionColumns.includes('effective_date')) {
      database.exec('ALTER TABLE transactions DROP COLUMN effective_date');
    }
    const postingColumns = database.pragma('table_info(postings)').map((column) => column.name);
    if (!postingColumns.includes('report_date')) {
      if (postingColumns.includes('effective_date')) {
        database.exec('ALTER TABLE postings RENAME COLUMN effective_date TO report_date');
      } else {
        database.exec('ALTER TABLE postings ADD COLUMN report_date TEXT');
      }
    }
    if (!postingColumns.includes('lot_cost_quantity')) {
      database.exec(`
        ALTER TABLE postings ADD COLUMN lot_cost_quantity TEXT;
        ALTER TABLE postings ADD COLUMN lot_cost_commodity TEXT;
        ALTER TABLE postings ADD COLUMN lot_cost_is_total INTEGER
          CHECK (lot_cost_is_total IN (0, 1));
      `);
    }
    const hasLegacySekPrices = database.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sek_prices'",
    ).pluck().get();
    if (hasLegacySekPrices) database.exec('DROP TABLE sek_prices');
  }

  return { SCHEMA_VERSION, migrateDatabase };
};
