'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { asFunction, createContainer, InjectionMode, listModules, Lifetime } = require('../../lib/awilix');

function moduleName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(baseName)) {
    throw new Error(`Module filename must use lowercase kebab-case: ${fileName}`);
  }
  return baseName.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function discoverModules(directory) {
  const modules = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of modules) {
    if (!fs.statSync(path.join(directory, name, 'index.js'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Module ${name} must contain index.js`);
    }
  }
  return modules;
}

function assertPolicyKeys(modules, policy, label) {
  const discovered = new Set(modules);
  const configured = new Set(Object.keys(policy));
  const missing = modules.filter((name) => !configured.has(name));
  const unknown = [...configured].filter((name) => !discovered.has(name));
  if (missing.length || unknown.length) {
    throw new Error(`${label} policy mismatch: missing [${missing.join(', ')}], unknown [${unknown.join(', ')}]`);
  }
}

function dependencyOrder(modules, policy) {
  assertPolicyKeys(modules, policy, 'Module');
  const discovered = new Set(modules);
  const order = [];
  const active = new Set();
  const visited = new Set();
  function visit(name) {
    if (active.has(name)) throw new Error(`Module dependency cycle: ${[...active, name].join(' -> ')}`);
    if (visited.has(name)) return;
    active.add(name);
    for (const dependency of policy[name]) {
      if (!discovered.has(dependency)) {
        throw new Error(`Unknown module dependency: ${name} -> ${dependency}`);
      }
      visit(dependency);
    }
    active.delete(name);
    visited.add(name);
    order.push(name);
  }
  for (const name of modules) visit(name);
  return order;
}

function createLocalContainer(directory, dependencies) {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });
  const locations = new Map();
  for (const { path: fileName } of listModules('**/*.js', { cwd: directory })) {
    const name = moduleName(fileName);
    if (locations.has(name)) {
      throw new Error(`Duplicate module registration ${name}: ${locations.get(name)} and ${fileName}`);
    }
    locations.set(name, fileName);
    const factory = require(fileName);
    if (typeof factory !== 'function') throw new TypeError(`${fileName} must export a factory`);
    container.register(name, asFunction(() => factory(dependencies), { lifetime: Lifetime.SINGLETON }));
  }
  return { container, locations };
}

function scopedDependencies(moduleName, localContainer, providers, getFacade, externals) {
  return new Proxy(Object.create(null), {
    get(_target, name) {
      if (typeof name !== 'string') return undefined;
      if (name === 'external') return externals;
      const local = localContainer();
      if (local?.hasRegistration(name)) return local.resolve(name);
      for (const provider of providers) {
        if (provider === name) return getFacade(provider);
      }
      throw new Error(`${moduleName} cannot access unknown or forbidden dependency ${name}`);
    },
  });
}

module.exports = {
  assertPolicyKeys, createLocalContainer, dependencyOrder, discoverModules,
  moduleName, scopedDependencies,
};
