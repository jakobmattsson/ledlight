'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { listModules } = require('../../lib/awilix');
const { createRepositoryContainer } = require('../../src/composition/repository-container');

const root = path.resolve(__dirname, '../..');

test('the query read model matches the schema and every referenced table', () => {
  const contract = createRepositoryContainer(__dirname, '../../src/modules')
    .$$private.resolveInternal('database', 'readModelContract');
  const database = new Database(':memory:');
  try {
    database.exec(fs.readFileSync(path.join(root, 'src/modules/database/schema.sql'), 'utf8'));
    for (const [table, columns] of Object.entries(contract)) {
      const actual = database.prepare(`PRAGMA table_info(${table})`).all().map(({ name }: { name: string }) => name);
      assert.deepEqual(actual, columns, table);
    }
    const source = listModules('src/modules/queries/**/*.js', { cwd: root })
      .map(({ path: fileName }: { path: string }) => fs.readFileSync(fileName, 'utf8')).join('\n');
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all().map(({ name }: { name: string }) => name);
    const referenced = tables.filter((table: string) => new RegExp(
      `\\b(?:FROM|JOIN)\\s+${table}\\b`, 'iu',
    ).test(source));
    assert.deepEqual(Object.keys(contract).sort(), referenced.sort());
  } finally {
    database.close();
  }
});
