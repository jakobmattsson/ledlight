'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
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
    container.register(name, asFunction(() => Object.freeze(files.map(({ path: fileName }) => {
      const registrationName = moduleName(fileName);
      const relativePath = path.relative(listDirectory, fileName).split(path.sep).join('/');
      return Object.freeze({ name: registrationName, relativePath,
        value: container.resolve(registrationName) });
    })), { lifetime: Lifetime.SINGLETON }));
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

function loadDependencyPolicy(...modulesPathParts) {
  const modulesRoot = path.resolve(...modulesPathParts);
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  const allowedModules = Object.freeze(policy.allowedModules);
  const allowedExternal = Object.freeze(policy.allowedExternal);
  const modules = discoverModules(modulesRoot);
  const order = dependencyOrder(modules, allowedModules);
  assertPolicyKeys(modules, allowedExternal, 'External');
  return { modulesRoot, modules, order, allowedModules, allowedExternal };
}

function generateDependsOnYaml(...modulesPathParts) {
  const { modules, allowedModules, allowedExternal } = loadDependencyPolicy(...modulesPathParts);
  const sections = modules.map((name) => YAML.stringify({ [name]: {
    external: [...allowedExternal[name]].sort(),
    modules: [...allowedModules[name]].sort(),
  } }).trimEnd());
  return sections.length === 0 ? YAML.stringify({}) : `${sections.join('\n\n')}\n`;
}

function generateUsedByYaml(...modulesPathParts) {
  const { modules, allowedModules, allowedExternal } = loadDependencyPolicy(...modulesPathParts);
  const moduleUsers = Object.fromEntries(modules.map((name) => [name, []]));
  const externalNames = [...new Set(modules.flatMap((name) => allowedExternal[name]))].sort();
  const externalUsers = Object.fromEntries(externalNames.map((name) => [name, []]));
  for (const name of modules) {
    for (const dependency of allowedModules[name]) moduleUsers[dependency].push(name);
    for (const dependency of allowedExternal[name]) externalUsers[dependency].push(name);
  }
  for (const users of Object.values(moduleUsers)) users.sort();
  for (const users of Object.values(externalUsers)) users.sort();
  return `${YAML.stringify({ external: externalUsers }).trimEnd()}\n\n${YAML.stringify({ modules: moduleUsers })}`;
}

function firstYamlDifference(actual, expected, location) {
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
    for (const key of Object.keys(expected)) {
      const entry = location ? `${location}.${key}` : key;
      if (!Object.hasOwn(actual, key)) return `${entry}: missing entry`;
      const difference = firstYamlDifference(actual[key], expected[key], entry);
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

function validateGeneratedYaml(source, expected, fileName) {
  if (typeof source !== 'string') throw new TypeError(`${fileName}: expected YAML text`);
  let actual;
  try {
    actual = YAML.parse(source);
  } catch (error) {
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

function validateDependsOnYaml(source, ...modulesPathParts) {
  validateGeneratedYaml(source, generateDependsOnYaml(...modulesPathParts), 'depends-on.yaml');
}

function validateUsedByYaml(source, ...modulesPathParts) {
  validateGeneratedYaml(source, generateUsedByYaml(...modulesPathParts), 'used-by.yaml');
}

function createRepositoryContainer(...modulesPathParts) {
  const { modulesRoot, modules, order, allowedModules, allowedExternal } =
    loadDependencyPolicy(...modulesPathParts);
  const services = require(path.join(modulesRoot, 'external.js'))();
  const built = new Map();
  const internalOverrides = new Map();

  function build(moduleName) {
    if (built.has(moduleName)) return built.get(moduleName);
    const directory = path.join(modulesRoot, moduleName);
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

module.exports = {
  assertPolicyKeys, createLocalContainer, createRepositoryContainer, dependencyOrder,
  discoverModules, generateDependsOnYaml, generateUsedByYaml, moduleName, scopedDependencies,
  validateDependsOnYaml, validateUsedByYaml,
};
