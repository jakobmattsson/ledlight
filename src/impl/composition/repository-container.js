'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');
const REPOSITORY_MODULE_FILES = Object.freeze([
  'src/impl/cli/cli-arguments.js',
  'src/impl/cli/cli-command.js',
  'src/impl/cli/cli-configuration.js',
  'src/impl/cli/cli-format.js',
  'src/impl/cli/cli-options.js',
  'src/impl/cli/cli-stdin-journal.js',
  'src/impl/cli/output.js',
  'src/impl/cli/report-command.js',
]);
const COMMAND_DIRECTORY = path.join(REPOSITORY_ROOT, 'src/surface/commands');

function listJavaScriptFiles(relativeDirectory, recursive) {
  const directory = path.join(REPOSITORY_ROOT, relativeDirectory);
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...listJavaScriptFiles(relativePath, true));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(REPOSITORY_ROOT, relativePath));
    }
  }
  return files.sort();
}

function createContainer() {
  const registrations = Object.create(null);
  const instances = new Map();
  const resolving = new Set();
  const container = {
    registrations,
    register(values) {
      for (const [name, value] of Object.entries(values)) {
        registrations[name] = { value };
        instances.delete(name);
      }
      return this;
    },
    registerFactory(name, factory) {
      registrations[name] = { factory };
      instances.delete(name);
      return this;
    },
    hasRegistration(name) {
      return Object.hasOwn(registrations, name);
    },
    resolve(name) {
      if (instances.has(name)) return instances.get(name);
      if (!this.hasRegistration(name)) throw new Error(`Unknown dependency: ${name}`);
      if (resolving.has(name)) throw new Error(`Circular dependency: ${name}`);
      const registration = registrations[name];
      if (Object.hasOwn(registration, 'value')) return registration.value;
      resolving.add(name);
      try {
        const instance = registration.factory(dependencies);
        instances.set(name, instance);
        return instance;
      } finally {
        resolving.delete(name);
      }
    },
  };
  const dependencies = new Proxy(Object.create(null), {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return container.resolve(property);
    },
  });
  return container;
}

function relativeModulePath(fileName) {
  return path.relative(REPOSITORY_ROOT, fileName).replace(/\\/gu, '/');
}

function repositoryModuleName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(baseName)) {
    throw new Error(`Repository module filename must use lowercase kebab-case: ${fileName}`);
  }
  return baseName.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function commandGroup(relativePath) {
  const segments = relativePath.split(path.sep);
  if (segments.length !== 2 || !/^[a-z]+(?:-[a-z]+)*$/u.test(segments[0])) {
    throw new TypeError(`Command module must be directly inside one group directory: ${relativePath}`);
  }
  return segments[0];
}

function repositoryModules() {
  const modules = [
    ...REPOSITORY_MODULE_FILES.map((fileName) => path.join(REPOSITORY_ROOT, fileName)),
    ...listJavaScriptFiles('src/impl/core', false),
    ...listJavaScriptFiles('src/impl/ingestion', true),
    ...listJavaScriptFiles('src/impl/query-support', false),
  ].map((fileName) => ({ path: fileName }));
  const locations = new Map();
  for (const module of modules) {
    const name = repositoryModuleName(module.path);
    const previous = locations.get(name);
    if (previous) {
      throw new Error(`Duplicate repository module name ${name}: ${previous} and ${module.path}`);
    }
    if (name === 'queries' || name === 'commands') {
      throw new Error(`Repository module name is reserved for a collection: ${module.path}`);
    }
    locations.set(name, module.path);
  }
  return modules;
}

const REPOSITORY_MODULES = repositoryModules();
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
  return new Proxy(dependencies, {
    get(target, property, receiver) {
      if (typeof property === 'string') assertDependencyAllowed(consumerFile, property);
      return Reflect.get(target, property, receiver);
    },
  });
}

function moduleFactory(fileName) {
  const factory = require(fileName);
  if (typeof factory !== 'function') {
    throw new TypeError(`${relativeModulePath(fileName)} must export a factory.`);
  }
  return factory;
}

function surfaceModule(fileName, kind, dependencies) {
  const module = moduleFactory(fileName)(restrictedDependencies(fileName, dependencies));
  if (!module || typeof module !== 'object' || Array.isArray(module)) {
    throw new TypeError(`${relativeModulePath(fileName)} must return a ${kind} object.`);
  }
  return module;
}

function addUniqueName(names, name, kind) {
  if (names.has(name)) throw new Error(`Duplicate ${kind} name: ${name}`);
  names.add(name);
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
  return Object.freeze(listJavaScriptFiles('src/surface/queries', false)
    .map((fileName) => queryFromFile(fileName, dependencies, names)));
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
  const commands = listJavaScriptFiles('src/surface/commands', true)
    .map((fileName) => commandFromFile(fileName, dependencies, names));
  return Object.freeze(commands.sort((left, right) => left.name.localeCompare(right.name, 'en')));
}

function registerExternalModules(container) {
  container.register({
    commander: require('commander'),
    crypto: require('node:crypto'),
    currentWorkingDirectory: () => process.cwd(),
    envPaths: require('env-paths'),
    fs,
    os: require('node:os'),
    packageMetadata: require('../../../package.json'),
    path,
    processEnvironment: process.env,
    standardInput: {
      isTTY: () => Boolean(process.stdin.isTTY),
      read: () => require('node:fs').readFileSync(0, 'utf8'),
    },
    systemClock: {
      now: () => Date.now(),
      sleep(milliseconds) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
      },
    },
    sqlite: function LazyDatabase(...arguments_) {
      const Database = require('better-sqlite3');
      return new Database(...arguments_);
    },
    zod: require('zod'),
  });
}

function registerRepositoryModules(container) {
  registerExternalModules(container);
  for (const { path: fileName } of REPOSITORY_MODULES) {
    const factory = moduleFactory(fileName);
    const name = repositoryModuleName(fileName);
    if (container.hasRegistration(name)) {
      throw new Error(`Repository module name conflicts with an existing registration: ${name}`);
    }
    container.registerFactory(name, (dependencies) =>
      factory(restrictedDependencies(fileName, dependencies)));
  }
  container.registerFactory('queries', loadQueries);
  container.registerFactory('commands', loadCommands);
  return container;
}

function createRepositoryContainer() {
  return registerRepositoryModules(createContainer());
}

module.exports = {
  createRepositoryContainer,
  registerRepositoryModules,
  $$private: { assertDependencyAllowed, commandGroup, repositoryModuleName },
};
