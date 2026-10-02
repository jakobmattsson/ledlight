'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  Lifetime,
} = require('awilix');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const FACTORY_DIRECTORIES = [
  'src/ledlight/accounting',
  'src/ledlight/application',
  'src/ledlight/cli',
  'src/ledlight/journal',
  'src/ledlight/reports',
  'src/ledlight/sqlite',
  'src/ledlight/syntax',
];
const EXTRA_FACTORY_FILES = ['src/ledlight/index.js'];
const EXCLUDED_FACTORY_FILES = new Set([
  'src/ledlight/cli/cli-modules.js',
  'src/ledlight/cli/run.js',
]);

function camelCasePath(fileName) {
  const words = fileName
    .replace(/\\/gu, '/')
    .replace(/\.(?:js|json)$/u, '')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  return words.map((word, index) => index === 0
    ? word[0].toLowerCase() + word.slice(1)
    : word[0].toUpperCase() + word.slice(1)).join('');
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

function repositoryFactoryFiles() {
  const directoryFiles = FACTORY_DIRECTORIES.flatMap((relativeDirectory) =>
    filesBelow(path.join(REPOSITORY_ROOT, relativeDirectory)));
  return [...directoryFiles, ...EXTRA_FACTORY_FILES.map((fileName) =>
    path.join(REPOSITORY_ROOT, fileName))]
    .filter((fileName) => fileName.endsWith('.js'))
    .filter((fileName) => !fileName.includes(`${path.sep}modules${path.sep}`))
    .filter((fileName) => !EXCLUDED_FACTORY_FILES.has(
      path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/'),
    ));
}

function registerExternalModules(container) {
  container.register({
    nodeCrypto: asValue(require('node:crypto')),
    nodeFs: asValue(require('node:fs')),
    nodePath: asValue(require('node:path')),
    ohmJs: asValue({
      grammar(...arguments_) {
        return require('ohm-js').grammar(...arguments_);
      },
    }),
    betterSqlite3: asValue(function LazyDatabase(...arguments_) {
      const Database = require('better-sqlite3');
      return new Database(...arguments_);
    }),
  });
}

function registerRepositoryModules(container) {
  registerExternalModules(container);
  for (const fileName of repositoryFactoryFiles()) {
    const relativeName = path.relative(REPOSITORY_ROOT, fileName);
    const factory = require(fileName);
    if (typeof factory !== 'function') {
      throw new TypeError(`${relativeName} must export an Awilix factory.`);
    }
    container.register(
      camelCasePath(relativeName),
      asFunction(factory, { lifetime: Lifetime.SINGLETON }),
    );
  }
  return container;
}

function createRepositoryContainer() {
  return registerRepositoryModules(createContainer({ injectionMode: InjectionMode.PROXY }));
}

module.exports = {
  camelCasePath,
  createRepositoryContainer,
  registerRepositoryModules,
  repositoryFactoryFiles,
};
