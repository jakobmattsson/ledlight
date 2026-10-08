'use strict';

const path = require('node:path');
const { asFunction, listModules, Lifetime } = require('awilix');

function moduleName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(baseName)) {
    throw new Error(`Module filename must use lowercase kebab-case: ${fileName}`);
  }
  return baseName.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
}

function listUniqueModules(patterns, { cwd, reservedNames }) {
  const modules = listModules(patterns, { cwd });
  const locations = new Map();
  for (const module of modules) {
    const name = moduleName(module.path);
    const previous = locations.get(name);
    if (previous) {
      throw new Error(`Duplicate module name ${name}: ${previous} and ${module.path}`);
    }
    if (reservedNames.includes(name)) {
      throw new Error(`Module name is reserved for a collection: ${module.path}`);
    }
    locations.set(name, module.path);
  }
  return modules;
}

function moduleFactory(fileName, displayPath) {
  const factory = require(fileName);
  if (typeof factory !== 'function') {
    throw new TypeError(`${displayPath} must export an Awilix factory.`);
  }
  return factory;
}

function proxyDependencies(dependencies, onAccess) {
  return new Proxy(dependencies, {
    get(target, property, receiver) {
      if (typeof property === 'string') onAccess(property);
      return Reflect.get(target, property, receiver);
    },
  });
}

function surfaceModule(fileName, kind, dependencies, displayPath) {
  const module = moduleFactory(fileName, displayPath)(dependencies);
  if (!module || typeof module !== 'object' || Array.isArray(module)) {
    throw new TypeError(`${displayPath} must return a ${kind} object.`);
  }
  return module;
}

function addUniqueName(names, name, kind) {
  if (names.has(name)) throw new Error(`Duplicate ${kind} name: ${name}`);
  names.add(name);
}

function registerModuleFactories(container, { patterns, cwd, modules, displayPath, wrapDependencies }) {
  const factoryLocations = new Map(modules.map(({ path: fileName }) => {
    const factory = moduleFactory(fileName, displayPath(fileName));
    const name = moduleName(fileName);
    if (container.hasRegistration(name)) {
      throw new Error(`Module name conflicts with an existing registration: ${name}`);
    }
    return [factory, fileName];
  }));
  container.loadModules(patterns, {
    cwd,
    formatName: 'camelCase',
    resolverOptions: {
      lifetime: Lifetime.SINGLETON,
      register(factory, options) {
        const fileName = factoryLocations.get(factory);
        if (!fileName) throw new Error('Awilix loaded an unknown module factory');
        return asFunction(
          (dependencies) => factory(wrapDependencies(fileName, dependencies)),
          options,
        );
      },
    },
  });
}

module.exports = {
  addUniqueName,
  listUniqueModules,
  moduleName,
  proxyDependencies,
  registerModuleFactories,
  surfaceModule,
};
