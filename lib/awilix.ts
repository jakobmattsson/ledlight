'use strict';

const fs = require('node:fs');
const path = require('node:path');

const InjectionMode = Object.freeze({ PROXY: 'PROXY' });
const Lifetime = Object.freeze({ SINGLETON: 'SINGLETON' });

type Registration =
  | { kind: 'value'; value: unknown }
  | { kind: 'function'; factory: (dependencies: Record<string, unknown>) => unknown; lifetime?: string };
type ModuleEntry = { path: string };

function asValue(value: unknown): Registration {
  return { kind: 'value', value };
}

function asFunction(factory: (dependencies: Record<string, unknown>) => unknown, options?: { lifetime?: string }): Registration {
  if (typeof factory !== 'function') throw new TypeError('Factory must be a function.');
  return { kind: 'function', factory, lifetime: options?.lifetime };
}

function globPattern(pattern: string): RegExp {
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

function filesBelow(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fileName = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(fileName));
    else if (entry.isFile()) files.push(fileName);
  }
  return files;
}

function listModules(patterns: string | string[], options: { cwd: string }): ModuleEntry[] {
  const matches = new Set<string>();
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
  return [...matches].sort().map((fileName) => ({ path: fileName }));
}

function createContainer(options: { injectionMode: string }) {
  if (options?.injectionMode !== InjectionMode.PROXY) {
    throw new Error('Only proxy injection is supported.');
  }
  const registrations: Record<string, Registration> = Object.create(null);
  const singletons = new Map<string, unknown>();
  const resolving = new Set<string>();
  const container = {
    registrations,
    register(nameOrRegistrations: string | Record<string, Registration>, resolver?: Registration) {
      const entries: Array<[string, Registration | undefined]> = typeof nameOrRegistrations === 'string'
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
    hasRegistration(name: string): boolean {
      return Object.hasOwn(registrations, name);
    },
    resolve(name: string): unknown {
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
    loadModules(patterns: string | string[], settings: {
      formatName: string;
      cwd: string;
      resolverOptions: { register: (factory: unknown, options: unknown) => Registration };
    }) {
      if (settings.formatName !== 'camelCase') {
        throw new Error('Only camelCase module names are supported.');
      }
      for (const module of listModules(patterns, { cwd: settings.cwd })) {
        const factory = require(module.path);
        const baseName = path.basename(module.path, path.extname(module.path));
        const name = baseName.replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase());
        this.register(name, settings.resolverOptions.register(factory, settings.resolverOptions));
      }
      return this;
    },
  };
  const dependencies: Record<string, unknown> = new Proxy(Object.create(null), {
    get(_target, property: string | symbol) {
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
