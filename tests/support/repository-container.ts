'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createTestRepositoryContainer } = require('@jakobm/portico/testing');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const modulesPath = path.resolve(__dirname, '../../src/modules');
const container = createTestRepositoryContainer(modulesPath);

type DependencyOverrides = {
  externals?: Record<string, unknown>;
  internals?: Record<string, Record<string, unknown>>;
};

function moduleName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName))
    .replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase());
}

function registrationFor(fileName: string) {
  const repositoryFileName = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(REPOSITORY_ROOT, fileName);
  const resolvedFileName = fs.statSync(repositoryFileName).isDirectory()
    ? path.join(repositoryFileName, 'index.js')
    : repositoryFileName;
  const relative = path.relative(path.join(REPOSITORY_ROOT, 'src/modules'), resolvedFileName);
  const [group, member] = relative.split(path.sep);
  if (group !== 'implementations' && group !== 'interfaces') {
    throw new Error(`Module file must be in interfaces or implementations: ${fileName}`);
  }
  const owner = group === 'interfaces' ? moduleName(member) : member;
  return { owner, name: moduleName(resolvedFileName) };
}

function resolveRepositoryModule(fileName: string) {
  const { owner, name } = registrationFor(fileName);
  return container.resolveInternal(owner, name);
}

function resolveTestModule(fileName: string, overrides?: DependencyOverrides) {
  const testContainer = createTestRepositoryContainer(modulesPath);
  if (overrides?.externals) testContainer.overrideExternals(overrides.externals);
  for (const [owner, registrations] of Object.entries(overrides?.internals || {})) {
    for (const [name, value] of Object.entries(registrations)) {
      testContainer.overrideInternal(owner, name, value);
    }
  }
  const { owner, name } = registrationFor(fileName);
  return testContainer.resolveInternal(owner, name);
}

function resolveQuery(name: any) {
  const query = container.resolve('queries').definitions.find((candidate: any) => candidate.name === name);
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
    ingestionWarning: container.resolveInternal('journal', 'ingestionWarning'),
    syntaxErrors: container.resolveInternal('journal', 'syntaxErrors'),
    topLevelBlocks: container.resolveInternal('journal', 'topLevelBlocks'),
  });
}

module.exports = { resolveCommands, resolveQuery, resolveReferenceParser, resolveRepositoryModule, resolveTestModule };
