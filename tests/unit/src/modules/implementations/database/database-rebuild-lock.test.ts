'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveTestModule } = require('../../../../../support/repository-container');

function temporaryDatabasePath(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-rebuild-lock-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'journal.sqlite');
}

function rebuildLock(systemClock: { now(): number; sleep(milliseconds: number): void | Promise<void> }) {
  return resolveTestModule('src/modules/implementations/database/database-rebuild-lock.js', {
    externals: { processRuntime: { pid: () => 1234 }, systemClock },
  });
}

test('waits for another rebuild and releases its own lock', (t: TestContext) => {
  const databasePath = temporaryDatabasePath(t);
  const lockPath = `${databasePath}.lock`;
  fs.writeFileSync(lockPath, 'another process\n');
  let now = 0;
  let sleeps = 0;
  const { withRebuildLock } = rebuildLock({
    now: () => now,
    sleep(milliseconds: number) {
      now += milliseconds;
      sleeps += 1;
      fs.rmSync(lockPath);
    },
  });

  assert.equal(withRebuildLock(databasePath, () => {
    assert.equal(fs.readFileSync(lockPath, 'utf8'), '1234\n');
    return 'complete';
  }), 'complete');
  assert.equal(sleeps, 1);
  assert.equal(fs.existsSync(lockPath), false);
});

test('fails with a database code when the rebuild lock times out', (t: TestContext) => {
  const databasePath = temporaryDatabasePath(t);
  fs.writeFileSync(`${databasePath}.lock`, 'another process\n');
  let now = 0;
  const { withRebuildLock, $$private } = rebuildLock({
    now: () => now,
    sleep() {
      now = $$private.LOCK_TIMEOUT_MILLISECONDS;
    },
  });

  assert.throws(
    () => withRebuildLock(databasePath, () => assert.fail('must not acquire the lock')),
    (error: { code: string; message: string }) => error.code === 'LEDLIGHT_DATABASE' && /Timed out waiting/u.test(error.message),
  );
});
