'use strict';
type Core = ReturnType<typeof import('../../../interfaces/core')>;
type Dependencies = {
  core: Pick<Core, 'publicErrors'>;
  external: {
    fs: Pick<typeof import('node:fs'), 'openSync' | 'writeFileSync' | 'closeSync' | 'rmSync'>;
    processRuntime: { pid(): number };
    systemClock: { now(): number; sleep(milliseconds: number): void };
  };
};
type Result = {
  withRebuildLock<Value>(databasePath: string, operation: () => Value): Value;
  $$private: { LOCK_TIMEOUT_MILLISECONDS: number; RETRY_INTERVAL_MILLISECONDS: number };
};

export = ({
  core: {
    publicErrors: { createError, errorCodes },
  },
  external: {
    fs,
    processRuntime,
    systemClock
  },
}: Dependencies): Result => {

  const LOCK_TIMEOUT_MILLISECONDS = 5_000;
  const RETRY_INTERVAL_MILLISECONDS = 25;

  function lockTimeout(databasePath: string): Error {
    return createError(
      errorCodes.DATABASE,
      `Timed out waiting for the Ledlight database rebuild lock at ${databasePath}.lock`,
    );
  }

  function withRebuildLock<Value>(databasePath: string, operation: () => Value): Value {
    const lockPath = `${databasePath}.lock`;
    const deadline = systemClock.now() + LOCK_TIMEOUT_MILLISECONDS;
    let descriptor;
    while (descriptor === undefined) {
      try {
        descriptor = fs.openSync(lockPath, 'wx');
      } catch (error: unknown) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) throw error;
        if (systemClock.now() >= deadline) throw lockTimeout(databasePath);
        systemClock.sleep(RETRY_INTERVAL_MILLISECONDS);
      }
    }

    try {
      fs.writeFileSync(descriptor, `${processRuntime.pid()}\n`);
      return operation();
    } finally {
      fs.closeSync(descriptor);
      fs.rmSync(lockPath, { force: true });
    }
  }

  return {
    withRebuildLock,
    $$private: { LOCK_TIMEOUT_MILLISECONDS, RETRY_INTERVAL_MILLISECONDS },
  };
};
