'use strict';

const path = require('node:path');
const { listModules } = require('../../lib/awilix');
const {
  assertPolicyKeys, createLocalContainer, dependencyOrder, discoverModules, moduleName,
  scopedDependencies,
} = require('./module-container');

const MODULES_ROOT = path.resolve(__dirname, '../modules');

const allowedModules = Object.freeze({
  core: [],
  journal: ['core'],
  accounting: ['core', 'journal'],
  database: ['core', 'journal', 'accounting'],
  queries: ['core', 'accounting', 'database'],
  commands: [],
  project: ['core', 'journal', 'database', 'queries'],
  cli: ['core', 'commands', 'project'],
});

const allowedExternal = Object.freeze({
  core: ['crypto', 'currentWorkingDirectory', 'envPaths', 'fs', 'path', 'processEnvironment', 'zod'],
  journal: ['buffer', 'crypto', 'fs', 'path', 'zod'],
  accounting: [],
  database: ['fs', 'path', 'processRuntime', 'schemaPath', 'sqlite', 'systemClock'],
  queries: ['zod'],
  commands: ['commander'],
  project: ['fs', 'os', 'path'],
  cli: ['commander', 'currentWorkingDirectory', 'packageMetadata',
    'processRuntime', 'standardInput'],
});

function externalServices() {
  return {
    buffer: Buffer,
    commander: require('commander'),
    crypto: require('node:crypto'),
    currentWorkingDirectory: () => process.cwd(),
    envPaths: require('env-paths'),
    fs: require('node:fs'),
    os: require('node:os'),
    packageMetadata: require('../../package.json'),
    path: require('node:path'),
    processEnvironment: process.env,
    processRuntime: {
      pid: () => process.pid,
      commandLineArguments: () => process.argv.slice(2),
      setExitCode: (code) => { process.exitCode = code; },
      exit: (code) => process.exit(code),
      standardOutput: process.stdout,
      standardError: process.stderr,
    },
    schemaPath: path.join(MODULES_ROOT, 'database/schema.sql'),
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
  };
}

function createRepositoryContainer() {
  const modules = discoverModules(MODULES_ROOT);
  const order = dependencyOrder(modules, allowedModules);
  assertPolicyKeys(modules, allowedExternal, 'External');
  const services = externalServices();
  const built = new Map();
  const internalOverrides = new Map();

  function build(moduleName) {
    if (built.has(moduleName)) return built.get(moduleName);
    const directory = path.join(MODULES_ROOT, moduleName);
    const facadeFactory = require(path.join(directory, 'index.js'));
    if (typeof facadeFactory !== 'function') {
      throw new TypeError(`${moduleName}/index.js must export a facade factory`);
    }
    const externals = Object.freeze(Object.fromEntries(allowedExternal[moduleName].map((name) => {
      if (!Object.hasOwn(services, name)) throw new Error(`Unknown external dependency: ${name}`);
      return [name, services[name]];
    })));
    let local;
    const dependencies = scopedDependencies(moduleName, () => local?.container,
      allowedModules[moduleName], (provider) => build(provider).facade, externals);
    local = createLocalContainer(directory, dependencies);
    for (const [name, registration] of internalOverrides.get(moduleName) ?? []) {
      local.container.register(name, registration);
    }
    const definitions = ['queries', 'commands'].includes(moduleName)
      ? listModules('definitions/**/*.js', { cwd: directory }).map(({ path: fileName }) => ({
        name: moduleNameFromFile(fileName),
        commandName: path.basename(fileName, '.js'),
        group: commandGroup(moduleName, directory, fileName),
        fileName,
      }))
      : [];
    const facade = facadeFactory({ resolve: (name) => local.container.resolve(name), definitions });
    if (!facade || typeof facade !== 'object') {
      throw new TypeError(`${moduleName}/index.js must return a facade`);
    }
    const module = { ...local, facade };
    built.set(moduleName, module);
    return module;
  }

  return {
    resolve(name) {
      if (!modules.includes(name)) throw new Error(`Unknown module: ${name}`);
      return build(name).facade;
    },
    register(registrations) {
      for (const [name, registration] of Object.entries(registrations)) {
        if (!Object.hasOwn(services, name)) throw new Error(`Unknown external dependency: ${name}`);
        if (registration?.kind !== 'value') throw new TypeError(`Expected value registration: ${name}`);
        services[name] = registration.value;
      }
      built.clear();
    },
    $$private: {
      order,
      registerInternal(moduleName, name, registration) {
        if (!modules.includes(moduleName)) throw new Error(`Unknown module: ${moduleName}`);
        if (!internalOverrides.has(moduleName)) internalOverrides.set(moduleName, new Map());
        internalOverrides.get(moduleName).set(name, registration);
        built.clear();
      },
      resolveInternal(moduleName, name) {
        if (!modules.includes(moduleName)) throw new Error(`Unknown module: ${moduleName}`);
        return build(moduleName).container.resolve(name);
      },
    },
  };
}

function moduleNameFromFile(fileName) {
  return moduleName(fileName);
}

function commandGroup(owner, directory, fileName) {
  const relative = path.relative(path.join(directory, 'definitions'), fileName);
  const segments = relative.split(path.sep);
  if (owner === 'commands' && (segments.length !== 2 ||
      !/^[a-z]+(?:-[a-z]+)*$/u.test(segments[0]))) {
    throw new TypeError(`Command module must be directly inside one group directory: ${fileName}`);
  }
  if (owner === 'queries' && segments.length !== 1) {
    throw new TypeError(`Query module must be directly inside definitions: ${fileName}`);
  }
  return segments.length === 2 ? segments[0] : 'queries';
}

module.exports = { allowedExternal, allowedModules, createRepositoryContainer };
