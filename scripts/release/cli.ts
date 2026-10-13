#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runCli } = require('./release');

runCli({
  argv: process.argv,
  environment: process.env,
  invocationDirectory: process.cwd(),
  repositoryDirectory: path.resolve(__dirname, '../../..'),
  spawnSync,
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (message: string) => console.log(`${new Date().toTimeString().slice(0, 8)} ${message}`),
}).catch((error: unknown) => {
  console.error(`Release stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
