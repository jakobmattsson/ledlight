#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const tests = [
  'tests/unit/**/*.test.js',
  'tests/integration/**/*.test.js',
  'tests/conventions/*.test.js',
];
const reporters = process.env.ALLURE_RESULTS_DIR
  ? [
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=allure-node-test/reporter',
    '--test-reporter-destination=stdout',
  ]
  : [];
const result = spawnSync(process.execPath, ['--test', ...reporters, ...tests], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exitCode = result.status ?? 1;
