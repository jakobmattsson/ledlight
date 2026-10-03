'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const createPublicErrors = require('../../../../../src/api/errors');
const createDatabase = require('../../../../../src/ingestion/database/database');
const createRebuildLock = require('../../../../../src/ingestion/database/rebuild-lock');

function temporaryDatabasePath(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-rebuild-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'journal.sqlite');
}

function rebuildLock(systemClock) {
  const publicErrors = createPublicErrors();
  return {
    ...createRebuildLock({ fs, publicErrors, systemClock }),
    errorCodes: publicErrors.errorCodes,
  };
}

test('waits for another rebuild and releases its own lock', (t) => {
  const databasePath = temporaryDatabasePath(t);
  const lockPath = `${databasePath}.lock`;
  fs.writeFileSync(lockPath, 'another process\n');
  let now = 0;
  let sleeps = 0;
  const { withRebuildLock } = rebuildLock({
    now: () => now,
    sleep(milliseconds) {
      now += milliseconds;
      sleeps += 1;
      fs.rmSync(lockPath);
    },
  });

  assert.equal(withRebuildLock(databasePath, () => 'complete'), 'complete');
  assert.equal(sleeps, 1);
  assert.equal(fs.existsSync(lockPath), false);
});

test('fails with a database code when the rebuild lock times out', (t) => {
  const databasePath = temporaryDatabasePath(t);
  fs.writeFileSync(`${databasePath}.lock`, 'another process\n');
  let now = 0;
  const { errorCodes, withRebuildLock, $$private } = rebuildLock({
    now: () => now,
    sleep() {
      now = $$private.LOCK_TIMEOUT_MILLISECONDS;
    },
  });

  assert.throws(
    () => withRebuildLock(databasePath, () => assert.fail('must not acquire the lock')),
    (error) => error.code === errorCodes.DATABASE && /Timed out waiting/u.test(error.message),
  );
});

test('rechecks freshness after acquiring the rebuild lock', () => {
  const statuses = [
    { inSync: false, reason: 'source_files_changed' },
    { inSync: true, reason: 'in_sync' },
  ];
  let checks = 0;
  const database = createDatabase({
    path,
    journal: { loadJournal: () => assert.fail('must not reload a current database') },
    databaseFreshness: {
      checkDatabaseSync() {
        const status = statuses[checks];
        checks += 1;
        return status;
      },
      databaseJournalPath: () => assert.fail('the journal path was supplied'),
    },
    databaseRebuildLock: { withRebuildLock: (_databasePath, operation) => operation() },
    journalWriter: { writeJournalDatabase: () => assert.fail('must not rebuild a current database') },
    publicErrors: createPublicErrors(),
  });

  assert.deepEqual(database.ensureDatabaseCurrent('journal.sqlite', 'journal.ledger'), {
    rebuilt: false,
    status: statuses[1],
  });
  assert.equal(checks, 2);
});
