'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveTestModule } = require('../../../../../support/repository-container');

test('rechecks freshness after acquiring the rebuild lock', () => {
  const statuses = [
    { inSync: false, reason: 'source_files_changed', journalPath: 'journal.ledger' },
    { inSync: true, reason: 'in_sync', journalPath: 'journal.ledger' },
  ];
  let checks = 0;
  const database = resolveTestModule('src/modules/implementations/database/database.js', {
    internals: {
      database: {
        databaseFreshness: {
          checkDatabaseSync() {
            const status = statuses[checks];
            checks += 1;
            return status;
          },
        },
        databaseRebuildLock: {
          withRebuildLock: (_databasePath: string, operation: () => unknown) => operation(),
        },
        journalWriter: { writeJournalDatabase: () => assert.fail('must not rebuild a current database') },
      },
      journal: {
        journal: { loadJournal: () => assert.fail('must not reload a current database') },
      },
    },
  });

  assert.deepEqual(database.prepareDatabase('journal.sqlite', { kind: 'file', path: 'journal.ledger' }),
    { journalPath: 'journal.ledger' });
  assert.equal(checks, 2);
});
