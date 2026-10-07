'use strict';

module.exports = ({
  fs,
  path,
  sqlite: Database,
  journalManifest: { loadJournalManifest },
  databaseMigration: { SCHEMA_VERSION },
}) => {

  function databaseWithoutSchema(databasePath, journalPath, reason) {
    return {
      databasePath: path.resolve(databasePath),
      journalPath: path.resolve(journalPath),
      inSync: false,
      reason,
      added: [],
      removed: [],
      changed: [],
    };
  }

  function checkDatabaseSync(databasePath, journalPath) {
    const resolvedDatabasePath = path.resolve(databasePath);
    if (!fs.existsSync(resolvedDatabasePath)) {
      return databaseWithoutSchema(databasePath, journalPath, 'database_missing');
    }

    const database = new Database(resolvedDatabasePath, { readonly: true, fileMustExist: true });
    try {
      const hasDatabaseMetadata = database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'database_metadata'
    `).pluck().get();
      const hasLegacyMetadata = database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'metadata'
    `).pluck().get();
      const hasSourceFiles = database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'source_files'
    `).pluck().get();
      if ((!hasDatabaseMetadata && !hasLegacyMetadata) || !hasSourceFiles) {
        return databaseWithoutSchema(databasePath, journalPath, 'schema_missing');
      }

      const metadataTable = hasDatabaseMetadata ? 'database_metadata' : 'metadata';
      const metadata = new Map(database.prepare(
        `SELECT key, value FROM ${metadataTable}`,
      ).raw().all());
      if (metadata.get('schema_version') !== SCHEMA_VERSION) {
        return databaseWithoutSchema(databasePath, journalPath, 'schema_version_mismatch');
      }

      const journal = loadJournalManifest(journalPath);
      const storedFiles = database.prepare(
        'SELECT path, sha256, size FROM source_files ORDER BY id',
      ).all();
      const storedByPath = new Map(storedFiles.map((file) => [file.path, file]));
      const currentByPath = new Map(journal.files.map((file) => [file.path, file]));
      const added = journal.files.filter((file) => !storedByPath.has(file.path)).map((file) => file.path);
      const removed = storedFiles.filter((file) => !currentByPath.has(file.path)).map((file) => file.path);
      const changed = journal.files
        .filter((file) => {
          const stored = storedByPath.get(file.path);
          return stored && (stored.sha256 !== file.sha256 || stored.size !== file.size);
        })
        .map((file) => file.path);
      const rootMatches = metadata.get('root_path') === journal.journalPath;
      const inSync = rootMatches && added.length === 0 && removed.length === 0 && changed.length === 0;

      return {
        databasePath: resolvedDatabasePath,
        journalPath: journal.journalPath,
        inSync,
        reason: inSync ? 'in_sync' : (rootMatches ? 'source_files_changed' : 'root_path_changed'),
        added,
        removed,
        changed,
      };
    } finally {
      database.close();
    }
  }

  function databaseJournalPath(databasePath) {
    const resolvedDatabasePath = path.resolve(databasePath);
    if (!fs.existsSync(resolvedDatabasePath)) return null;
    const database = new Database(resolvedDatabasePath, { readonly: true, fileMustExist: true });
    try {
      const hasDatabaseMetadata = database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'database_metadata'
    `).pluck().get();
      const hasLegacyMetadata = database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'metadata'
    `).pluck().get();
      if (!hasDatabaseMetadata && !hasLegacyMetadata) return null;
      const metadataTable = hasDatabaseMetadata ? 'database_metadata' : 'metadata';
      return database.prepare(
        `SELECT value FROM ${metadataTable} WHERE key = 'root_path'`,
      ).pluck().get() || null;
    } finally {
      database.close();
    }
  }

  return { checkDatabaseSync, databaseJournalPath };
};
