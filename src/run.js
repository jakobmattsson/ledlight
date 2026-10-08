#!/usr/bin/env node
'use strict';

// Examples:
// node src/run.js aggregate --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "Income:" --accounts "Expenses:" --denominate --invert
// node src/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:" --denominate
// node src/run.js aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:" --accounts "Liabilities:"
// node src/run.js total-history --file main.ledger --accounts "Assets:" --format csv
// node src/run.js unrealized-gains --file main.ledger --accounts "Assets:"

const { createRepositoryContainer } = require('./impl/composition/repository-container');

createRepositoryContainer().resolve('runCli').run();
