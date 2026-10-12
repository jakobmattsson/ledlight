'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { asValue } = require('../../lib/awilix');
const {
  allowedExternal, allowedModules, createRepositoryContainer,
} = require('../../src/composition/repository-container');
const {
  dependencyOrder, discoverModules, moduleName, scopedDependencies,
} = require('../../src/composition/module-container');

const root = path.resolve(__dirname, '../../src/modules');

test('discovers exactly the modules declared in the dependency policy', () => {
  const directories = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(discoverModules(root), directories);
  assert.deepEqual(Object.keys(allowedModules).sort(), directories);
  assert.deepEqual(Object.keys(allowedExternal).sort(), directories);
  for (const name of directories) assert.ok(fs.existsSync(path.join(root, name, 'index.js')));
});

test('rejects a discovered module without an index facade', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-module-scope-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'incomplete'));
  assert.throws(() => discoverModules(directory), /must contain index.js/u);
});

test('rejects missing, unknown, and cyclic module edges', () => {
  assert.throws(() => dependencyOrder(['a'], {}), /missing \[a\]/u);
  assert.throws(() => dependencyOrder([], { a: [] }), /unknown \[a\]/u);
  assert.throws(() => dependencyOrder(['a'], { a: ['b'] }), /Unknown module dependency/u);
  assert.throws(() => dependencyOrder(['a', 'b'], { a: ['b'], b: ['a'] }), /cycle/u);
});

test('resolves all public module facades and hides internal factories', () => {
  const container = createRepositoryContainer();
  for (const name of discoverModules(root)) assert.doesNotThrow(() => container.resolve(name));
  assert.throws(() => container.resolve('decimal'), /Unknown module/u);
  assert.equal(Object.hasOwn(container.resolve('queries'), 'accountFilter'), false);
  assert.equal(Object.hasOwn(container.resolve('commands'), 'cliOptions'), false);
  assert.equal(Object.hasOwn(container.resolve('project'), '$$private'), false);
});

test('external overrides remain scoped to their permitted modules', () => {
  const container = createRepositoryContainer();
  container.register({ currentWorkingDirectory: asValue(() => '/test-journal') });
  assert.equal(container.resolve('core').configuration !== undefined, true);
  assert.equal(container.resolve('project'), container.resolve('project'));
});

test('registration names derive from kebab-case filenames', () => {
  assert.equal(moduleName('/example/database-reader.js'), 'databaseReader');
  assert.throws(() => moduleName('/example/database_reader.js'), /kebab-case/u);
});

test('module scope exposes local factories and allowed facades only', () => {
  const local = { hasRegistration: (name) => name === 'privateHelper',
    resolve: () => 'local value' };
  const facade = Object.freeze({ publicValue: 'visible' });
  const dependencies = scopedDependencies('consumer', () => local, ['provider'],
    () => facade, Object.freeze({ clock: 'clock value' }));
  assert.equal(dependencies.privateHelper, 'local value');
  assert.equal(dependencies.publicValue, 'visible');
  assert.equal(dependencies.external.clock, 'clock value');
  assert.equal(dependencies.provider, facade);
  assert.throws(() => dependencies.privateProviderValue, /forbidden dependency/u);
  assert.throws(() => dependencies.unlistedSibling, /forbidden dependency/u);
  assert.throws(() => dependencies.fs, /forbidden dependency/u);
  assert.throws(() => dependencies.clock, /forbidden dependency/u);
});
