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

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_MODULE_PATTERNS = Object.freeze([
  'src/cli/cli-arguments.js',
  'src/cli/cli-command.js',
  'src/cli/cli-format.js',
  'src/core/*.js',
  'src/ingestion/**/*.js',
  'src/queries/support/*.js',
]);
const QUERY_MODULE_PATTERN = 'src/queries/*.js';

function repositoryModuleName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(baseName)) {
    throw new Error(`Repository module filename must use lowercase kebab-case: ${fileName}`);
  }
  return baseName.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function repositoryModules() {
  const modules = listModules(REPOSITORY_MODULE_PATTERNS, { cwd: REPOSITORY_ROOT });
  const locations = new Map();
  for (const module of modules) {
    const name = repositoryModuleName(module.path);
    const previous = locations.get(name);
    if (previous) {
      throw new Error(`Duplicate repository module name ${name}: ${previous} and ${module.path}`);
    }
    if (name === 'queries') {
      throw new Error(`Repository module name is reserved for the query collection: ${module.path}`);
    }
    locations.set(name, module.path);
  }
  return modules;
}

const REPOSITORY_MODULES = repositoryModules();
const REGISTRATION_LOCATIONS = new Map([
  ...REPOSITORY_MODULES.map(({ path: fileName }) => [
    repositoryModuleName(fileName),
    path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/'),
  ]),
  ['queries', 'src/queries'],
]);

function sourceArea(fileName) {
  return /^src\/([^/]+)/u.exec(fileName)?.[1];
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
  const consumerFile = path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/');
  return new Proxy(dependencies, {
    get(target, property, receiver) {
      if (typeof property === 'string') assertDependencyAllowed(consumerFile, property);
      return Reflect.get(target, property, receiver);
    },
  });
}

function loadQueries(dependencies) {
  const names = new Set();
  return Object.freeze(listModules(QUERY_MODULE_PATTERN, { cwd: REPOSITORY_ROOT })
    .map(({ path: fileName }) => {
      const query = require(fileName)(restrictedDependencies(fileName, dependencies));
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must return a query object.`);
      }
      if (typeof query.name !== 'string' || query.name.length === 0) {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose a name.`);
      }
      if (names.has(query.name)) throw new Error(`Duplicate query name: ${query.name}`);
      if (typeof query.inputSchema?.safeParse !== 'function') {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose an inputSchema.`);
      }
      if (typeof query.execute !== 'function') {
        throw new TypeError(`${path.relative(REPOSITORY_ROOT, fileName)} must expose an execute function.`);
      }
      if (query.execute.length !== 3) {
        throw new TypeError(
          `${path.relative(REPOSITORY_ROOT, fileName)} execute must accept database, options, and caches.`,
        );
      }
      names.add(query.name);
      return Object.freeze(query);
    }));
}

function registerExternalModules(container) {
  container.register({
    crypto: asValue(require('node:crypto')),
    envPaths: asValue(require('env-paths')),
    fs: asValue(require('node:fs')),
    packageMetadata: asValue(require('../../package.json')),
    path: asValue(require('node:path')),
    processEnvironment: asValue(process.env),
    systemClock: asValue({
      now: () => Date.now(),
      sleep(milliseconds) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
      },
    }),
    ohm: asValue({
      grammar(...arguments_) {
        return require('ohm-js').grammar(...arguments_);
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
  const factoryLocations = new Map(REPOSITORY_MODULES.map(({ path: fileName }) => {
    const relativeName = path.relative(REPOSITORY_ROOT, fileName);
    const factory = require(fileName);
    if (typeof factory !== 'function') {
      throw new TypeError(`${relativeName} must export an Awilix factory.`);
    }
    const name = repositoryModuleName(fileName);
    if (container.hasRegistration(name)) {
      throw new Error(`Repository module name conflicts with an existing registration: ${name}`);
    }
    return [factory, fileName];
  }));
  container.loadModules(REPOSITORY_MODULE_PATTERNS, {
    cwd: REPOSITORY_ROOT,
    formatName: 'camelCase',
    resolverOptions: {
      lifetime: Lifetime.SINGLETON,
      register(factory, options) {
        const fileName = factoryLocations.get(factory);
        if (!fileName) throw new Error('Awilix loaded an unknown repository module factory');
        return asFunction(
          (dependencies) => factory(restrictedDependencies(fileName, dependencies)),
          options,
        );
      },
    },
  });
  container.register('queries', asFunction(loadQueries, { lifetime: Lifetime.SINGLETON }));
  return container;
}

function createRepositoryContainer() {
  return registerRepositoryModules(createContainer({ injectionMode: InjectionMode.PROXY }));
}

module.exports = {
  createRepositoryContainer,
  registerRepositoryModules,
  $$private: { assertDependencyAllowed, repositoryModuleName },
};
