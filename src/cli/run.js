#!/usr/bin/env node
'use strict';

// Examples:
// node src/cli/run.js aggregate --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "Income:" --accounts "Expenses:" --value --invert
// node src/cli/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:" --value
// node src/cli/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:"
// node src/cli/run.js balance-history --file main.ledger --accounts "Assets:" --accounts "Liabilities:" --csv
// node src/cli/run.js gain --file main.ledger --accounts "Assets:"

const { loadCliModules } = require('./cli-modules');

const modules = loadCliModules();
modules.output.handleBrokenPipe();

try {
  modules.output.writeOutput(modules.reportCommand.run(process.argv.slice(2)));
} catch (error) {
  modules.output.writeError(`${error.message}\n`);
  process.exitCode = 1;
}
