'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const assets = [
  'src/modules/dependencies.yaml',
  'src/modules/database/schema.sql',
  'src/modules/journal/ledger.ohm',
  'scripts/ledger-compatibility/ledger-compatibility-matrix.yaml',
];

for (const asset of assets) {
  const destination = path.join(repositoryRoot, 'dist', asset);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, asset), destination);
}
