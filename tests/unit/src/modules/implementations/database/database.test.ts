'use strict';

const assert = require('node:assert/strict');
const withExternal = require('../../../../../support/external-dependencies.js');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const createPublicErrors = require('../../../../../../src/modules/implementations/core/public-errors');
const createDatabase = withExternal(require('../../../../../../src/modules/implementations/database/database'), ['fs', 'path']);

test('rechecks freshness after acquiring the rebuild lock', () => {
  const statuses = [
    { inSync: false, reason: 'source_files_changed', journalPath: 'journal.ledger' },
    { inSync: true, reason: 'in_sync', journalPath: 'journal.ledger' },
  ];
  let checks = 0;
  const database = createDatabase({
    fs,
    path,
    journal: { loadJournal: () => assert.fail('must not reload a current database') },
    databaseFreshness: {
      checkDatabaseSync() {
        const status = statuses[checks];
        checks += 1;
        return status;
      },
    },
    databaseRebuildLock: { withRebuildLock: (_databasePath: string, operation: () => unknown) => operation() },
    journalWriter: { writeJournalDatabase: () => assert.fail('must not rebuild a current database') },
    core: { publicErrors: createPublicErrors() },
  });

  assert.deepEqual(database.prepareDatabase('journal.sqlite', { kind: 'file', path: 'journal.ledger' }),
    { journalPath: 'journal.ledger' });
  assert.equal(checks, 2);
});
