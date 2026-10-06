#!/usr/bin/env node
'use strict';

// Examples:
// node src/cli/run.js aggregate --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "Income:" --accounts "Expenses:" --value --invert
// node src/cli/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:" --value
// node src/cli/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:"
// node src/cli/run.js balance-history --file main.ledger --accounts "Assets:" --format csv
// node src/cli/run.js unrealized-gains --file main.ledger --accounts "Assets:"

const { loadCliModules } = require('./cli-modules');
const { executeCli } = require('./execute-cli');

const modules = loadCliModules();
modules.output.handleBrokenPipe();

const exitCode = executeCli(modules, process.argv.slice(2));
if (exitCode !== 0) process.exitCode = exitCode;
