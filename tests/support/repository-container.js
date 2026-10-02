'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { asValue } = require('awilix');
const {
  camelCasePath,
  createRepositoryContainer,
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
  const relativeName = path.relative(REPOSITORY_ROOT, resolvedFileName);
  return container.resolve(camelCasePath(relativeName));
}

function buildFactory(fileName, values) {
  const testContainer = container.createScope();
  testContainer.register(Object.fromEntries(Object.entries(values ?? {})
    .map(([name, value]) => [name, asValue(value)])));
  return testContainer.build(require(fileName));
}

module.exports = { buildFactory, container, resolveRepositoryModule };
