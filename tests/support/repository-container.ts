'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createTestRepositoryContainer } = require('@jakobm/portico/testing');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const modulesPath = path.resolve(__dirname, '../../src/modules');
const container = createTestRepositoryContainer(modulesPath);
const PATCH = Symbol('dependency patch');

type DependencyPatch = { [PATCH]: Record<string, unknown> };

type DependencyOverrides = {
  externals?: Record<string, unknown>;
  internals?: Record<string, Record<string, unknown>>;
};

function patchDependency(members: Record<string, unknown>): DependencyPatch {
  return { [PATCH]: members };
}

function isDependencyPatch(value: unknown): value is DependencyPatch {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, PATCH);
}

function patchedValue(original: unknown, patch: DependencyPatch, name: string): Record<string, unknown> {
  if (typeof original !== 'object' || original === null || Array.isArray(original)) {
    throw new TypeError(`Cannot patch non-object dependency: ${name}`);
  }
  return { ...original, ...patch[PATCH] };
}

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
  if (overrides?.externals) {
    const externals = Object.fromEntries(Object.entries(overrides.externals).map(([name, value]) => [
      name,
      isDependencyPatch(value)
        ? patchedValue(testContainer.resolveExternal(name), value, name)
        : value,
    ]));
    testContainer.overrideExternals(externals);
  }
  for (const [owner, registrations] of Object.entries(overrides?.internals || {})) {
    for (const [name, value] of Object.entries(registrations)) {
      if (!isDependencyPatch(value)) testContainer.overrideInternal(owner, name, value);
    }
  }
  for (const [owner, registrations] of Object.entries(overrides?.internals || {})) {
    for (const [name, value] of Object.entries(registrations)) {
      if (isDependencyPatch(value)) {
        testContainer.overrideInternal(owner, name,
          patchedValue(testContainer.resolveInternal(owner, name), value, `${owner}.${name}`));
      }
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

module.exports = { patchDependency, resolveCommands, resolveQuery, resolveReferenceParser,
  resolveRepositoryModule, resolveTestModule };
