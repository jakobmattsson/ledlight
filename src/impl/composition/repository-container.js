'use strict';

const path = require('node:path');
const {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  listModules,
  Lifetime,
} = require('awilix');
const {
  addUniqueName,
  listUniqueModules,
  moduleName: repositoryModuleName,
  proxyDependencies,
  registerModuleFactories,
  surfaceModule: loadSurfaceModule,
} = require('./module-container');

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const REPOSITORY_MODULE_PATTERNS = Object.freeze([
  'src/impl/cli/*.js',
  'src/impl/{core,query-support}/*.js',
  'src/impl/ingestion/**/*.js',
]);
const QUERY_MODULE_PATTERN = 'src/surface/queries/*.js';
const COMMAND_MODULE_PATTERN = 'src/surface/commands/**/*.js';
const COMMAND_DIRECTORY = path.join(REPOSITORY_ROOT, 'src/surface/commands');

function relativeModulePath(fileName) {
  return path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/');
}

function commandGroup(relativePath) {
  const segments = relativePath.split(path.sep);
  if (segments.length !== 2 || !/^[a-z]+(?:-[a-z]+)*$/u.test(segments[0])) {
    throw new TypeError(`Command module must be directly inside one group directory: ${relativePath}`);
  }
  return segments[0];
}

const REPOSITORY_MODULES = listUniqueModules(REPOSITORY_MODULE_PATTERNS, {
  cwd: REPOSITORY_ROOT,
  reservedNames: ['queries', 'commands'],
});
const REGISTRATION_LOCATIONS = new Map([
  ...REPOSITORY_MODULES.map(({ path: fileName }) => [
    repositoryModuleName(fileName),
    relativeModulePath(fileName),
  ]),
  ['queries', 'src/surface/queries'],
  ['commands', 'src/surface/commands'],
]);

function sourceArea(fileName) {
  if (fileName === 'src/surface/queries' || fileName.startsWith('src/surface/queries/')) {
    return 'queries';
  }
  if (fileName === 'src/surface/commands' || fileName.startsWith('src/surface/commands/')) {
    return 'cli';
  }
  if (fileName === 'src/impl/query-support' || fileName.startsWith('src/impl/query-support/')) {
    return 'queries';
  }
  return /^src\/impl\/([^/]+)/u.exec(fileName)?.[1];
}

function assertDependencyAllowed(consumerFile, dependencyName) {
  const providerFile = REGISTRATION_LOCATIONS.get(dependencyName);
  if (!providerFile) return;
  const consumerArea = sourceArea(consumerFile);
  const providerArea = sourceArea(providerFile);
  if (providerArea === 'cli' && consumerArea !== 'cli') {
    throw new Error(`${consumerFile} may not depend on CLI module ${providerFile}`);
  }
  if (consumerArea === 'ingestion' && providerArea === 'queries') {
    throw new Error(`${consumerFile} may not depend on query module ${providerFile}`);
  }
}

function restrictedDependencies(fileName, dependencies) {
  const consumerFile = relativeModulePath(fileName);
  return proxyDependencies(dependencies, (name) => assertDependencyAllowed(consumerFile, name));
}

function surfaceModule(fileName, kind, dependencies) {
  return loadSurfaceModule(
    fileName,
    kind,
    restrictedDependencies(fileName, dependencies),
    relativeModulePath(fileName),
  );
}

function queryFromFile(fileName, dependencies, names) {
  const name = repositoryModuleName(fileName);
  const query = surfaceModule(fileName, 'query', dependencies);
  const relativeName = relativeModulePath(fileName);
  addUniqueName(names, name, 'query');
  if (typeof query.inputSchema?.safeParse !== 'function') {
    throw new TypeError(`${relativeName} must expose an inputSchema.`);
  }
  if (typeof query.execute !== 'function') {
    throw new TypeError(`${relativeName} must expose an execute function.`);
  }
  if (query.execute.length !== 3) {
    throw new TypeError(
      `${relativeName} execute must accept database, options, and caches.`,
    );
  }
  return Object.freeze({ ...query, name });
}

function loadQueries(dependencies) {
  const names = new Set();
  return Object.freeze(listModules(QUERY_MODULE_PATTERN, { cwd: REPOSITORY_ROOT })
    .map(({ path: fileName }) => queryFromFile(fileName, dependencies, names)));
}

function commandFromFile(fileName, dependencies, names) {
  const group = commandGroup(path.relative(COMMAND_DIRECTORY, fileName));
  const command = surfaceModule(fileName, 'command', dependencies);
  const name = path.basename(fileName, '.js');
  addUniqueName(names, name, 'command');
  return { ...command, name, operation: repositoryModuleName(fileName), group };
}

function loadCommands(dependencies) {
  const names = new Set();
  const commands = listModules(COMMAND_MODULE_PATTERN, { cwd: REPOSITORY_ROOT })
    .map(({ path: fileName }) => commandFromFile(fileName, dependencies, names));
  return Object.freeze(commands.sort((left, right) => left.name.localeCompare(right.name, 'en')));
}

function registerExternalModules(container) {
  container.register({
    commander: asValue(require('commander')),
    crypto: asValue(require('node:crypto')),
    currentWorkingDirectory: asValue(() => process.cwd()),
    envPaths: asValue(require('env-paths')),
    fs: asValue(require('node:fs')),
    os: asValue(require('node:os')),
    packageMetadata: asValue(require('../../../package.json')),
    path: asValue(require('node:path')),
    processEnvironment: asValue(process.env),
    processRuntime: asValue({
      pid: () => process.pid,
      commandLineArguments: () => process.argv.slice(2),
      setExitCode: (code) => { process.exitCode = code; },
    }),
    standardInput: asValue({
      isTTY: () => Boolean(process.stdin.isTTY),
      read: () => require('node:fs').readFileSync(0, 'utf8'),
    }),
    systemClock: asValue({
      now: () => Date.now(),
      sleep(milliseconds) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
      },
    }),
    sqlite: asValue(function LazyDatabase(...arguments_) {
      const Database = require('better-sqlite3');
      return new Database(...arguments_);
    }),
    zod: asValue(require('zod')),
  });
}

function registerRepositoryModules(container) {
  registerExternalModules(container);
  registerModuleFactories(container, {
    patterns: REPOSITORY_MODULE_PATTERNS,
    cwd: REPOSITORY_ROOT,
    modules: REPOSITORY_MODULES,
    displayPath: relativeModulePath,
    wrapDependencies: restrictedDependencies,
  });
  container.register('queries', asFunction(loadQueries, { lifetime: Lifetime.SINGLETON }));
  container.register('commands', asFunction(loadCommands, { lifetime: Lifetime.SINGLETON }));
  return container;
}

function createRepositoryContainer() {
  return registerRepositoryModules(createContainer({ injectionMode: InjectionMode.PROXY }));
}

module.exports = {
  createRepositoryContainer,
  registerRepositoryModules,
  $$private: { assertDependencyAllowed, commandGroup, repositoryModuleName },
};
