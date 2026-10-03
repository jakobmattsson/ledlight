'use strict';

const path = require('node:path');
const { asFunction, createContainer, Lifetime } = require('awilix');
const { registerRepositoryModules } = require('../composition/repository-container');

const PRIVATE_EXPORTS = '$$private';

function validateCliModule(instance, name) {
  if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
    throw new TypeError(`CLI module ${name} must return an object.`);
  }
  const privateExports = instance[PRIVATE_EXPORTS];
  if (privateExports !== undefined &&
      (typeof privateExports !== 'object' || privateExports === null ||
       Array.isArray(privateExports))) {
    throw new TypeError(`CLI module ${name} must return a ${PRIVATE_EXPORTS} object.`);
  }
  return instance;
}

function loadCliModules(directory) {
  const container = registerRepositoryModules(createContainer());
  const repositoryModuleNames = new Set(Object.keys(container.registrations));
  container.loadModules(['*.js'], {
    cwd: directory || path.join(__dirname, 'modules'),
    formatName: 'camelCase',
    resolverOptions: {
      lifetime: Lifetime.SINGLETON,
      register(factory, options) {
        return asFunction((dependencies) => {
          const instance = validateCliModule(
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

module.exports = { loadCliModules };
