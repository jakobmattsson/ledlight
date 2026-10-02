'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  createRepositoryContainer,
  $$private: { repositoryModuleName },
} = require('../../src/composition/repository-container');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const container = createRepositoryContainer();

function resolveRepositoryModule(fileName) {
  const repositoryFileName = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(REPOSITORY_ROOT, fileName);
  const resolvedFileName = fs.statSync(repositoryFileName).isDirectory()
    ? path.join(repositoryFileName, 'index.js')
    : repositoryFileName;
  return container.resolve(repositoryModuleName(resolvedFileName));
}

module.exports = { resolveRepositoryModule };
