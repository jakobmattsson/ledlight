'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { asFunction, createContainer, InjectionMode, listModules, Lifetime } = require('../../lib/awilix');

type Policy = Record<string, string[]>;
type LocalContainer = { hasRegistration(name: string): boolean; resolve(name: string): unknown; register(name: string, registration: unknown): void };
type LocalModule = { container: LocalContainer; locations: Map<string, string> };

function moduleName(fileName: string): string {
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(baseName)) {
    throw new Error(`Module filename must use lowercase kebab-case: ${fileName}`);
  }
  return baseName.replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase());
}

function discoverModules(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) throw new Error(`Interface directory must be flat: ${entry.name}`);
  }
  return entries.filter((entry: import('node:fs').Dirent) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry: import('node:fs').Dirent) => moduleName(entry.name)).sort();
}

function assertPolicyKeys(modules: string[], policy: Policy, label: string): void {
  const discovered = new Set(modules);
  const configured = new Set(Object.keys(policy));
  const missing = modules.filter((name: string) => !configured.has(name));
  const unknown = [...configured].filter((name: string) => !discovered.has(name));
  if (missing.length || unknown.length) {
    throw new Error(`${label} policy mismatch: missing [${missing.join(', ')}], unknown [${unknown.join(', ')}]`);
  }
}

function dependencyOrder(modules: string[], policy: Policy): string[] {
  assertPolicyKeys(modules, policy, 'Module');
  const discovered = new Set(modules);
  const order: string[] = [];
  const active = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string): void {
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

function createLocalContainer(directory: string, dependencies: Record<string, unknown>, facadeFile?: string): LocalModule {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });
  const locations = new Map<string, string>();
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
  if (facadeFile) {
    if (locations.has('index')) throw new Error(`Duplicate module registration index: ${locations.get('index')} and ${facadeFile}`);
    locations.set('index', facadeFile);
    const factory = require(facadeFile);
    if (typeof factory !== 'function') throw new TypeError(`${facadeFile} must export a factory`);
    container.register('index', asFunction(() => factory(dependencies), { lifetime: Lifetime.SINGLETON }));
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('list-')) continue;
    if (!/^list-[a-z]+(?:-[a-z]+)*$/u.test(entry.name)) {
      throw new Error(`List directory must use list-<kebab-case>: ${entry.name}`);
    }
    const name = moduleName(`${entry.name.slice('list-'.length)}.js`);
    const listDirectory = path.join(directory, entry.name);
    if (locations.has(name)) {
      throw new Error(`Duplicate module registration ${name}: ${locations.get(name)} and ${listDirectory}`);
    }
    locations.set(name, listDirectory);
    const files = listModules('**/*.js', { cwd: listDirectory });
    container.register(name, asFunction(() => Object.freeze(files.map(({ path: fileName }: { path: string }) => {
      const registrationName = moduleName(fileName);
      const relativePath = path.relative(listDirectory, fileName).split(path.sep).join('/');
      return Object.freeze({ name: registrationName, relativePath,
        value: container.resolve(registrationName) });
    })), { lifetime: Lifetime.SINGLETON }));
  }
  return { container, locations };
}

function scopedDependencies(moduleName: string, localContainer: () => LocalContainer | undefined, providers: string[], getFacade: (name: string) => unknown, externals: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(Object.create(null), {
    get(_target: object, name: string | symbol) {
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

function loadDependencyPolicy(...modulesPathParts: string[]) {
  const modulesRoot = path.resolve(...modulesPathParts);
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  const allowedModules = Object.freeze(policy['allowed-modules']);
  const allowedExternal = Object.freeze(policy['allowed-external']);
  const modules = discoverModules(path.join(modulesRoot, 'interfaces'));
  const implementationRoot = path.join(modulesRoot, 'implementations');
  const implementations = fs.readdirSync(implementationRoot, { withFileTypes: true })
    .filter((entry: import('node:fs').Dirent) => entry.isDirectory())
    .map((entry: import('node:fs').Dirent) => entry.name).sort();
  assertPolicyKeys(modules, Object.fromEntries(implementations.map((name: string) => [name, []])), 'Implementation');
  const order = dependencyOrder(modules, allowedModules);
  assertPolicyKeys(modules, allowedExternal, 'External');
  return { modulesRoot, modules, order, allowedModules, allowedExternal };
}

function generateDependsOnYaml(...modulesPathParts: string[]) {
  const { modules, allowedModules, allowedExternal } = loadDependencyPolicy(...modulesPathParts);
  const sections = modules.map((name: string) => YAML.stringify({ [name]: {
    external: [...allowedExternal[name]].sort(),
    modules: [...allowedModules[name]].sort(),
  } }).trimEnd());
  return sections.length === 0 ? YAML.stringify({}) : `${sections.join('\n\n')}\n`;
}

function generateUsedByYaml(...modulesPathParts: string[]) {
  const { modules, allowedModules, allowedExternal } = loadDependencyPolicy(...modulesPathParts);
  const moduleUsers: Policy = Object.fromEntries(modules.map((name: string) => [name, []]));
  const externalNames = [...new Set(modules.flatMap((name: string) => allowedExternal[name]))].sort();
  const externalUsers: Policy = Object.fromEntries(externalNames.map((name: string) => [name, []]));
  for (const name of modules) {
    for (const dependency of allowedModules[name]) moduleUsers[dependency].push(name);
    for (const dependency of allowedExternal[name]) externalUsers[dependency].push(name);
  }
  for (const users of Object.values(moduleUsers)) users.sort();
  for (const users of Object.values(externalUsers)) users.sort();
  return `${YAML.stringify({ external: externalUsers }).trimEnd()}\n\n${YAML.stringify({ modules: moduleUsers })}`;
}

function firstYamlDifference(actual: unknown, expected: unknown, location: string): string | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${location}: expected a list`;
    for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
      const item = `${location}[${index}]`;
      if (index >= actual.length) return `${item}: missing ${JSON.stringify(expected[index])}`;
      if (index >= expected.length) return `${item}: unexpected ${JSON.stringify(actual[index])}`;
      const difference = firstYamlDifference(actual[index], expected[index], item);
      if (difference) return difference;
    }
    return null;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return `${location || 'root'}: expected a mapping`;
    }
    const actualMap = actual as Record<string, unknown>;
    const expectedMap = expected as Record<string, unknown>;
    for (const key of Object.keys(expected)) {
      const entry = location ? `${location}.${key}` : key;
      if (!Object.hasOwn(actual, key)) return `${entry}: missing entry`;
      const difference = firstYamlDifference(actualMap[key], expectedMap[key], entry);
      if (difference) return difference;
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) {
        return `${location ? `${location}.` : ''}${key}: unexpected entry`;
      }
    }
    return null;
  }
  return Object.is(actual, expected) ? null
    : `${location}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

function validateGeneratedYaml(source: string, expected: string, fileName: string) {
  if (typeof source !== 'string') throw new TypeError(`${fileName}: expected YAML text`);
  let actual;
  try {
    actual = YAML.parse(source);
  } catch (error: any) {
    throw new Error(`${fileName}: invalid YAML: ${error.message}`, { cause: error });
  }
  const difference = firstYamlDifference(actual, YAML.parse(expected), '');
  if (difference) throw new Error(`${fileName}: ${difference}`);
  if (source !== expected) {
    const actualLines = source.split('\n');
    const expectedLines = expected.split('\n');
    const index = Array.from({ length: Math.max(actualLines.length, expectedLines.length) })
      .findIndex((_line, position) => expectedLines[position] !== actualLines[position]);
    throw new Error(`${fileName}: formatting differs at line ${index + 1}: expected `
      + `${JSON.stringify(expectedLines[index])}, got ${JSON.stringify(actualLines[index])}`);
  }
}

function validateDependsOnYaml(source: string, ...modulesPathParts: string[]) {
  validateGeneratedYaml(source, generateDependsOnYaml(...modulesPathParts), 'depends-on.yaml');
}

function validateUsedByYaml(source: string, ...modulesPathParts: string[]) {
  validateGeneratedYaml(source, generateUsedByYaml(...modulesPathParts), 'used-by.yaml');
}

function createRepositoryContainer(...modulesPathParts: string[]) {
  const { modulesRoot, modules, order, allowedModules, allowedExternal } =
    loadDependencyPolicy(...modulesPathParts);
  const services = require(path.join(modulesRoot, 'external.js'))();
  const built = new Map();
  const internalOverrides = new Map();

  function build(moduleName: string) {
    if (built.has(moduleName)) return built.get(moduleName);
    const directory = path.join(modulesRoot, 'implementations', moduleName);
    const facadeFile = path.join(modulesRoot, 'interfaces', `${moduleName}.js`);
    const externals = Object.freeze(Object.fromEntries(allowedExternal[moduleName].map((name: string) => {
      if (!Object.hasOwn(services, name)) throw new Error(`Unknown external dependency: ${name}`);
      return [name, services[name]];
    })));
    let local: LocalModule | undefined;
    const dependencies = scopedDependencies(moduleName, () => local?.container,
      allowedModules[moduleName], (provider: string) => build(provider).facade, externals);
    local = createLocalContainer(directory, dependencies, facadeFile);
    for (const [name, registration] of internalOverrides.get(moduleName) ?? []) {
      local.container.register(name, registration);
    }
    const facade = local.container.resolve('index');
    if (!facade || typeof facade !== 'object') {
      throw new TypeError(`interfaces/${moduleName}.js must return a facade`);
    }
    Object.freeze(facade);
    const module = { ...local, facade };
    built.set(moduleName, module);
    return module;
  }

  return {
    resolve(name: string) {
      if (!modules.includes(name)) throw new Error(`Unknown module: ${name}`);
      return build(name).facade;
    },
    register(registrations: Record<string, unknown>) {
      for (const [name, registration] of Object.entries(registrations)) {
        if (!Object.hasOwn(services, name)) throw new Error(`Unknown external dependency: ${name}`);
        if ((registration as any)?.kind !== 'value') throw new TypeError(`Expected value registration: ${name}`);
        services[name] = (registration as any).value;
      }
      built.clear();
    },
    $$private: {
      order,
      registerInternal(moduleName: string, name: string, registration: unknown) {
        if (!modules.includes(moduleName)) throw new Error(`Unknown module: ${moduleName}`);
        if (!internalOverrides.has(moduleName)) internalOverrides.set(moduleName, new Map());
        internalOverrides.get(moduleName).set(name, registration);
        built.clear();
      },
      resolveInternal(moduleName: string, name: string) {
        if (!modules.includes(moduleName)) throw new Error(`Unknown module: ${moduleName}`);
        return build(moduleName).container.resolve(name);
      },
    },
  };
}

module.exports = {
  assertPolicyKeys, createLocalContainer, createRepositoryContainer, dependencyOrder,
  discoverModules, generateDependsOnYaml, generateUsedByYaml, moduleName, scopedDependencies,
  validateDependsOnYaml, validateUsedByYaml,
};
