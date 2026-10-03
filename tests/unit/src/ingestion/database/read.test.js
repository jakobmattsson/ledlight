'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const createDatabaseReader = require('../../../../../src/ingestion/database/database-reader');

function createReader(events) {
  const database = {
    close() {
      events.push('close');
    },
  };
  const Database = function Database(databasePath, options) {
    events.push({ databasePath, options });
    return database;
  };
  const { readDatabase } = createDatabaseReader({
    path,
    sqlite: Database,
    decimal: {
      registerDecimalFunctions(receivedDatabase) {
        assert.equal(receivedDatabase, database);
        events.push('register');
      },
    },
  });
  return { database, readDatabase };
}

test('provides a configured read-only database to a query and closes it afterwards', () => {
  const events = [];
  const { database, readDatabase } = createReader(events);

  assert.equal(readDatabase('journal.sqlite', (receivedDatabase) => {
    assert.equal(receivedDatabase, database);
    events.push('query');
    return 'result';
  }), 'result');
  assert.deepEqual(events, [
    {
      databasePath: path.resolve('journal.sqlite'),
      options: { readonly: true, fileMustExist: true },
    },
    'register',
    'query',
    'close',
  ]);
});

test('closes the database when a query fails', () => {
  const events = [];
  const { readDatabase } = createReader(events);

  assert.throws(() => readDatabase('journal.sqlite', () => {
    events.push('query');
    throw new Error('query failed');
  }), /query failed/u);
  assert.equal(events.at(-1), 'close');
});
