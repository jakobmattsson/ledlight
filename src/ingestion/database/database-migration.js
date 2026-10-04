'use strict';

module.exports = ({
  fs,
  path,
}) => {

  const SCHEMA_VERSION = '19';
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const supportedVersions = new Set([
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', SCHEMA_VERSION,
  ]);

  function tableExists(database, name) {
    return database.prepare(
      'SELECT 1 FROM sqlite_schema WHERE type = \'table\' AND name = ?',
    ).pluck().get(name) !== undefined;
  }

  function storedSchemaVersion(database) {
    const table = tableExists(database, 'database_metadata')
      ? 'database_metadata'
      : (tableExists(database, 'metadata') ? 'metadata' : null);
    if (!table) return undefined;
    return database.prepare(
      `SELECT value FROM ${table} WHERE key = 'schema_version'`,
    ).pluck().get();
  }

  function recreateDatabase(database) {
    const foreignKeys = database.pragma('foreign_keys', { simple: true });
    database.pragma('foreign_keys = OFF');
    try {
      database.transaction(() => {
        database.exec(`
          DROP TABLE IF EXISTS posting_tags;
          DROP TABLE IF EXISTS ingestion_warnings;
          DROP TABLE IF EXISTS transaction_tags;
          DROP TABLE IF EXISTS resolved_posting_amounts;
          DROP TABLE IF EXISTS transaction_notes;
          DROP TABLE IF EXISTS postings;
          DROP TABLE IF EXISTS prices;
          DROP TABLE IF EXISTS valuation_prices;
          DROP TABLE IF EXISTS account_declarations;
          DROP TABLE IF EXISTS tag_declarations;
          DROP TABLE IF EXISTS commodity_properties;
          DROP TABLE IF EXISTS commodity_declarations;
          DROP TABLE IF EXISTS transactions;
          DROP TABLE IF EXISTS journal_entries;
          DROP TABLE IF EXISTS source_files;
          DROP TABLE IF EXISTS database_metadata;
          DROP TABLE IF EXISTS metadata;
          DROP TABLE IF EXISTS sek_prices;
        `);
        database.exec(schema);
      })();
    } finally {
      database.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
    }
  }

  function migrateDatabase(database) {
    const existingVersion = storedSchemaVersion(database);
    if (existingVersion !== undefined && !supportedVersions.has(existingVersion)) {
      throw new Error(`Unsupported Ledlight database schema version: ${existingVersion}`);
    }
    if (existingVersion !== undefined && existingVersion !== SCHEMA_VERSION) {
      recreateDatabase(database);
    } else {
      database.exec(schema);
    }
  }

  return { SCHEMA_VERSION, migrateDatabase };
};
