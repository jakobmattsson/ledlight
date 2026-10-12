'use strict';

const fs = require('node:fs');
const path = require('node:path');

const InjectionMode = Object.freeze({ PROXY: 'PROXY' });
const Lifetime = Object.freeze({ SINGLETON: 'SINGLETON' });

function asValue(value: any) {
  return { kind: 'value', value };
}

function asFunction(factory: any, options: any) {
  if (typeof factory !== 'function') throw new TypeError('Factory must be a function.');
  return { kind: 'function', factory, lifetime: options?.lifetime };
}

function globPattern(pattern: any) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (pattern.slice(index, index + 3) === '**/') {
      source += '(?:.*/)?';
      index += 2;
    } else if (pattern.slice(index, index + 2) === '**') {
      source += '.*';
      index += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else {
      source += '.+?^${}()|[]\\'.includes(character) ? `\\${character}` : character;
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function filesBelow(directory: any) {
  const files: any = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fileName = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(fileName));
    else if (entry.isFile()) files.push(fileName);
  }
  return files;
}

function listModules(patterns: any, options: any) {
  const matches = new Set();
  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    const wildcardIndex = pattern.indexOf('*');
    if (wildcardIndex === -1) {
      const fileName = path.resolve(options.cwd, pattern);
      if (fs.existsSync(fileName) && fs.statSync(fileName).isFile()) matches.add(fileName);
      continue;
    }
    const prefix = pattern.slice(0, wildcardIndex);
    const root = prefix.endsWith('/') ? prefix.slice(0, -1) : path.posix.dirname(prefix);
    const directory = path.resolve(options.cwd, root);
    if (!fs.existsSync(directory)) continue;
    const matcher = globPattern(pattern);
    for (const fileName of filesBelow(directory)) {
      const relativePath = path.relative(options.cwd, fileName).replace(/\\/gu, '/');
      if (matcher.test(relativePath)) matches.add(fileName);
    }
  }
  return [...matches].sort().map((fileName: any) => ({ path: fileName }));
}

function createContainer(options: any) {
  if (options?.injectionMode !== InjectionMode.PROXY) {
    throw new Error('Only proxy injection is supported.');
  }
  const registrations = Object.create(null);
  const singletons = new Map();
  const resolving = new Set();
  const container: any = {
    registrations,
    register(nameOrRegistrations: any, resolver: any) {
      const entries = typeof nameOrRegistrations === 'string'
        ? [[nameOrRegistrations, resolver]]
        : Object.entries(nameOrRegistrations);
      for (const [name, registration] of entries) {
        if (registration?.kind !== 'value' && registration?.kind !== 'function') {
          throw new TypeError(`Invalid registration: ${name}`);
        }
        registrations[name] = registration;
        singletons.delete(name);
      }
      return this;
    },
    hasRegistration(name: any) {
      return Object.hasOwn(registrations, name);
    },
    resolve(name: any) {
      if (singletons.has(name)) return singletons.get(name);
      if (!this.hasRegistration(name)) throw new Error(`Unknown dependency: ${name}`);
      if (resolving.has(name)) throw new Error(`Circular dependency: ${name}`);
      const registration = registrations[name];
      if (registration.kind === 'value') return registration.value;
      resolving.add(name);
      try {
        const instance = registration.factory(dependencies);
        if (registration.lifetime === Lifetime.SINGLETON) singletons.set(name, instance);
        return instance;
      } finally {
        resolving.delete(name);
      }
    },
    loadModules(patterns: any, settings: any) {
      if (settings.formatName !== 'camelCase') {
        throw new Error('Only camelCase module names are supported.');
      }
      for (const module of listModules(patterns, { cwd: settings.cwd })) {
        const factory = require(module.path);
        const baseName = path.basename(module.path, path.extname(module.path));
        const name = baseName.replace(/-([a-z])/gu, (_match: any, letter: any) => letter.toUpperCase());
        this.register(name, settings.resolverOptions.register(factory, settings.resolverOptions));
      }
      return this;
    },
  };
  const dependencies = new Proxy(Object.create(null), {
    get(_target: any, property: any) {
      if (typeof property !== 'string') return undefined;
      return container.resolve(property);
    },
  });
  return container;
}

module.exports = {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  listModules,
  Lifetime,
};
