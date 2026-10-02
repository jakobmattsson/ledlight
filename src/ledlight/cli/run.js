#!/usr/bin/env node
'use strict';

// Examples:
// node src/ledlight/cli/run.js aggregate --from 2024-01-01 --to 2024-12-31 --accounts "Income:" --accounts "Expenses:" --sek --invert
// node src/ledlight/cli/run.js aggregate --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:" --sek
// node src/ledlight/cli/run.js aggregate --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:"
// node src/ledlight/cli/run.js balance-history --accounts "Assets:" --accounts "Liabilities:" --csv

const { loadCliModules } = require('./cli-modules');

const modules = loadCliModules();
modules.output.handleBrokenPipe();

try {
  modules.output.writeOutput(modules.reportCommand.run(process.argv.slice(2)));
} catch (error) {
  modules.output.writeError(`${error.message}\n`);
  process.exitCode = 1;
}
