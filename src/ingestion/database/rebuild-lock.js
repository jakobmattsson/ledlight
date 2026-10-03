'use strict';

module.exports = ({
  fs,
  publicErrors: { createError, errorCodes },
  systemClock,
}) => {

  const LOCK_TIMEOUT_MILLISECONDS = 5_000;
  const RETRY_INTERVAL_MILLISECONDS = 25;

  function lockTimeout(databasePath) {
    return createError(
      errorCodes.DATABASE,
      `Timed out waiting for the Ledlight database rebuild lock at ${databasePath}.lock`,
    );
  }

  function withRebuildLock(databasePath, operation) {
    const lockPath = `${databasePath}.lock`;
    const deadline = systemClock.now() + LOCK_TIMEOUT_MILLISECONDS;
    let descriptor;
    while (descriptor === undefined) {
      try {
        descriptor = fs.openSync(lockPath, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (systemClock.now() >= deadline) throw lockTimeout(databasePath);
        systemClock.sleep(RETRY_INTERVAL_MILLISECONDS);
      }
    }

    try {
      fs.writeFileSync(descriptor, `${process.pid}\n`);
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
