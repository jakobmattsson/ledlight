'use strict';

const path = require('node:path');

module.exports = () => ({
  buffer: Buffer,
  commander: require('commander'),
  crypto: require('node:crypto'),
  currentWorkingDirectory: () => process.cwd(),
  envPaths: require('env-paths'),
  fs: require('node:fs'),
  os: require('node:os'),
  packageMetadata: require('../../package.json'),
  path,
  processEnvironment: process.env,
  processRuntime: {
    pid: () => process.pid,
    commandLineArguments: () => process.argv.slice(2),
    setExitCode: (code) => { process.exitCode = code; },
    exit: (code) => process.exit(code),
    standardOutput: process.stdout,
    standardError: process.stderr,
  },
  schemaPath: path.join(__dirname, 'database/internal/schema.sql'),
  standardInput: {
    isTTY: () => Boolean(process.stdin.isTTY),
    read: () => require('node:fs').readFileSync(0, 'utf8'),
  },
  systemClock: {
    now: () => Date.now(),
    sleep(milliseconds) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
    },
  },
  sqlite: function LazyDatabase(...arguments_) {
    const Database = require('better-sqlite3');
    return new Database(...arguments_);
  },
  zod: require('zod'),
});
