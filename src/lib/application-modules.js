'use strict';

const { asFunction, asValue, createContainer, Lifetime } = require('awilix');
const { registerRepositoryModules } = require('../composition/repository-container');

const PRIVATE_EXPORTS = '$$private';

function validateApplicationModule(instance, name) {
  if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
    throw new TypeError(`Application module ${name} must return an object.`);
  }
  const privateExports = instance[PRIVATE_EXPORTS];
  if (privateExports !== undefined &&
      (typeof privateExports !== 'object' || privateExports === null ||
       Array.isArray(privateExports))) {
    throw new TypeError(`Application module ${name} must return a ${PRIVATE_EXPORTS} object.`);
  }
  return instance;
}

function loadApplicationModules({ directory, patterns, values }) {
  const container = registerRepositoryModules(createContainer());
  const repositoryModuleNames = new Set(Object.keys(container.registrations));
  container.register(Object.fromEntries(Object.entries(values ?? {})
    .map(([name, value]) => [name, asValue(value)])));
  for (const name of Object.keys(values ?? {})) repositoryModuleNames.add(name);
  container.loadModules(patterns, {
    cwd: directory,
    formatName: 'camelCase',
    resolverOptions: {
      lifetime: Lifetime.SINGLETON,
      register(factory, options) {
        return asFunction((dependencies) => {
          const instance = validateApplicationModule(
            factory(dependencies),
            factory.name || '<anonymous>',
          );
          const publicApi = { ...instance };
          delete publicApi[PRIVATE_EXPORTS];
          return publicApi;
        }, options);
      },
    },
  });

  const modules = {};
  for (const name of Object.keys(container.registrations)
    .filter((registrationName) => !repositoryModuleNames.has(registrationName))) {
    modules[name] = container.resolve(name);
  }
  return modules;
}

module.exports = { loadApplicationModules };
