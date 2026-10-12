#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runCli } = require('./release');

runCli({
  argv: process.argv,
  environment: process.env,
  invocationDirectory: process.cwd(),
  repositoryDirectory: path.resolve(__dirname, '../..'),
  spawnSync,
  now: () => Date.now(),
  sleep: (ms: any) => new Promise((resolve: any) => setTimeout(resolve, ms)),
  log: (message: any) => console.log(`${new Date().toTimeString().slice(0, 8)} ${message}`),
}).catch((error: any) => {
  console.error(`Release stopped: ${error.message}`);
  process.exitCode = 1;
});
