'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {
  createRepositoryContainer,
} = require('../../src/composition/repository-container');
const { moduleName } = require('../../src/composition/module-container');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const container = createRepositoryContainer(path.resolve(__dirname, '../../src/modules'));

function resolveRepositoryModule(fileName) {
  const repositoryFileName = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(REPOSITORY_ROOT, fileName);
  const resolvedFileName = fs.statSync(repositoryFileName).isDirectory()
    ? path.join(repositoryFileName, 'index.js')
    : repositoryFileName;
  const relative = path.relative(path.join(REPOSITORY_ROOT, 'src/modules'), resolvedFileName);
  const owner = relative.split(path.sep)[0];
  return container.$$private.resolveInternal(owner, moduleName(resolvedFileName));
}

function resolveQuery(name) {
  const query = container.resolve('queries').definitions.find((candidate) => candidate.name === name);
  if (!query) throw new Error(`Unknown query: ${name}`);
  return query;
}

function resolveCommands() {
  return container.resolve('commands').definitions;
}

function resolveReferenceParser() {
  const createReferenceParser = require('./reference/reference-parser');
  return createReferenceParser({
    fs,
    path,
    ohm: require('ohm-js'),
    ingestionWarning: container.$$private.resolveInternal('journal', 'ingestionWarning'),
    syntaxErrors: container.$$private.resolveInternal('journal', 'syntaxErrors'),
    topLevelBlocks: container.$$private.resolveInternal('journal', 'topLevelBlocks'),
  });
}

module.exports = { resolveCommands, resolveQuery, resolveReferenceParser, resolveRepositoryModule };
