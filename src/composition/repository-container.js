'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const externalServices = require('../modules/_external');
const {
  assertPolicyKeys, createLocalContainer, dependencyOrder, discoverModules,
  scopedDependencies,
} = require('./module-container');

const MODULES_ROOT = path.resolve(__dirname, '../modules');

const policy = YAML.parse(fs.readFileSync(path.join(__dirname, 'dependency-policy.yaml'), 'utf8'));
const allowedModules = Object.freeze(policy.allowedModules);
const allowedExternal = Object.freeze(policy.allowedExternal);

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
    const facade = local.container.resolve('index');
    if (!facade || typeof facade !== 'object') {
      throw new TypeError(`${moduleName}/index.js must return a facade`);
    }
    Object.freeze(facade);
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

module.exports = { allowedExternal, allowedModules, createRepositoryContainer };
