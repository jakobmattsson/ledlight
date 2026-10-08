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

function resolveQuery(name) {
  const query = container.resolve('queries').find((candidate) => candidate.name === name);
  if (!query) throw new Error(`Unknown query: ${name}`);
  return query;
}

function resolveCommands() {
  return container.resolve('commands');
}

function resolveReferenceParser() {
  const createReferenceParser = require('./reference/reference-parser');
  return createReferenceParser({
    fs,
    path,
    ohm: require('ohm-js'),
    ingestionWarning: container.resolve('ingestionWarning'),
    syntaxErrors: container.resolve('syntaxErrors'),
    topLevelBlocks: container.resolve('topLevelBlocks'),
  });
}

module.exports = { resolveCommands, resolveQuery, resolveReferenceParser, resolveRepositoryModule };
