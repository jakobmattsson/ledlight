'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const assets = [
  'src/modules/dependencies.yaml',
  'src/modules/spec/schema.sql',
  'src/modules/spec/ledger.ohm',
  'scripts/ledger-compatibility/ledger-compatibility-matrix.yaml',
];

for (const asset of assets) {
  const destination = path.join(repositoryRoot, 'dist', asset);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, asset), destination);
}

function copyDeclarationFiles(directory: string): void {
  for (const entry of fs.readdirSync(path.join(repositoryRoot, directory), { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      copyDeclarationFiles(relativePath);
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      const destination = path.join(repositoryRoot, 'dist', relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
    }
  }
}

for (const directory of ['src', 'lib', 'scripts', 'tests']) copyDeclarationFiles(directory);
