'use strict';

import type { Dirent } from 'node:fs';
import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const { asValue } = require('../../lib/awilix');
const {
  createLocalContainer, createRepositoryContainer, dependencyOrder, discoverModules,
  moduleName, scopedDependencies,
} = require('../../src/composition/repository-container');

const root = path.resolve(__dirname, '../../src/modules');
const sourceRoot = path.resolve(__dirname, '../../../src/modules');
const policy = YAML.parse(fs.readFileSync(path.join(root, 'dependencies.yaml'), 'utf8'));
const allowedModules = policy['allowed-modules'];
const allowedExternal = policy['allowed-external'];

test('discovers exactly the modules declared in the dependency policy', () => {
  const directories = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory()).map((entry: Dirent) => entry.name).sort();
  assert.deepEqual(discoverModules(root), directories);
  assert.ok(fs.statSync(path.join(sourceRoot, 'external.ts')).isFile());
  assert.deepEqual(Object.keys(allowedModules).sort(), directories);
  assert.deepEqual(Object.keys(allowedExternal).sort(), directories);
  const rootAssets = { database: ['schema.sql'], journal: ['ledger.ohm'] };
  for (const name of directories) {
    const rootFiles = fs.readdirSync(path.join(sourceRoot, name), { withFileTypes: true })
      .filter((entry: Dirent) => entry.isFile() && !/\.(?:js|d\.ts|js\.map)$/u.test(entry.name))
      .map((entry: Dirent) => entry.name).sort();
    assert.deepEqual(rootFiles, ['index.ts', ...(rootAssets[name as keyof typeof rootAssets] ?? [])].sort(),
      `${name} must expose only its facade and declared assets at its root`);
  }
});

test('rejects a discovered module without an index facade', (context: TestContext) => {
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

test('resolves index factories as facades and hides internal factories', () => {
  const container = createRepositoryContainer(__dirname, '../../src/modules');
  for (const name of discoverModules(root)) {
    assert.equal(container.resolve(name), container.$$private.resolveInternal(name, 'index'));
    assert.ok(Object.isFrozen(container.resolve(name)), `${name} facade must be frozen`);
  }
  assert.throws(() => container.resolve('decimal'), /Unknown module/u);
  assert.equal(Object.hasOwn(container.resolve('queries'), 'accountFilter'), false);
  assert.equal(Object.hasOwn(container.resolve('commands'), 'cliOptions'), false);
  assert.equal(Object.hasOwn(container.resolve('project'), '$$private'), false);
  assert.equal(Object.hasOwn(container.resolve('database'), 'readModelContract'), false);
  assert.equal(Object.hasOwn(container.resolve('accounting').commodityMovements, 'unpricedReplacement'), false);
  assert.equal(Object.hasOwn(container.resolve('core').rational, 'fraction'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'apiOptions'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'maximize'), false);
  assert.equal(Object.hasOwn(container.resolve('core').decimal, 'registerDecimalFunctions'), false);
  assert.equal(Object.hasOwn(container.resolve('journal'), 'parse'), false);
  for (const [moduleName, member, formerGroup] of [
    ['accounting', 'inferEffectivePostingCosts', 'effectivePostingCosts'],
    ['accounting', 'validateGlobalAccounting', 'globalAccountingValidator'],
    ['accounting', 'valuationCommodityFromJournal', 'journalValuationCommodity'],
    ['accounting', 'PostingResolver', 'postingResolver'],
    ['cli', 'run', 'runCli'],
    ['core', 'pathsForJournal', 'cachePaths'],
    ['core', 'readConfiguration', 'configuration'],
    ['core', 'appendTotal', 'reportTotals'],
    ['core', 'createLedgerValuationRateResolver', 'valuationRateResolver'],
    ['database', 'ensureDatabaseCurrent', 'database'],
    ['database', 'readDatabase', 'databaseReader'],
    ['database', 'writeJournalDatabase', 'journalWriter'],
    ['journal', 'loadJournal', 'journal'],
    ['journal', 'loadJournalManifest', 'journalManifest'],
    ['journal', 'parseStrict', 'ledgerParser'],
  ]) {
    const facade = container.resolve(moduleName);
    assert.equal(typeof facade[member], 'function', `${moduleName}.${member}`);
    assert.equal(Object.hasOwn(facade, formerGroup), false, `${moduleName}.${formerGroup}`);
  }
});

test('external overrides remain scoped to their permitted modules', () => {
  const container = createRepositoryContainer(__dirname, '../../src/modules');
  container.register({ currentWorkingDirectory: asValue(() => '/test-journal') });
  assert.equal(typeof container.resolve('core').readConfiguration, 'function');
  assert.equal(container.resolve('project'), container.resolve('project'));
});

test('composes an independent module tree from the supplied path', (context: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'module-composition-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'source'));
  fs.mkdirSync(path.join(directory, 'consumer'));
  fs.writeFileSync(path.join(directory, 'dependencies.yaml'), `allowed-modules:
  source: []
  consumer: [source]
allowed-external:
  source: [greeting]
  consumer: []
`);
  fs.writeFileSync(path.join(directory, 'external.js'),
    "module.exports = () => ({ greeting: 'hello' });\n");
  fs.writeFileSync(path.join(directory, 'source', 'index.js'),
    'module.exports = ({ external: { greeting } }) => ({ greeting });\n');
  fs.writeFileSync(path.join(directory, 'consumer', 'index.js'),
    'module.exports = ({ source: { greeting } }) => ({ message: `${greeting}, world` });\n');

  const container = createRepositoryContainer(path.dirname(directory), path.basename(directory));
  assert.equal(container.resolve('consumer').message, 'hello, world');
  assert.deepEqual(container.$$private.order, ['source', 'consumer']);
  assert.equal(createRepositoryContainer(directory).resolve('consumer').message, 'hello, world');
  container.register({ greeting: asValue('goodbye') });
  assert.equal(container.resolve('consumer').message, 'goodbye, world');
});

test('registration names derive from kebab-case filenames', () => {
  assert.equal(moduleName('/example/database-reader.js'), 'databaseReader');
  assert.throws(() => moduleName('/example/database_reader.js'), /kebab-case/u);
});

test('list directories inject resolved files recursively with names and relative paths', (context: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-list-module-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'list-items', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'internal'));
  fs.writeFileSync(path.join(directory, 'index.js'),
    'module.exports = ({ items }) => ({ items });\n');
  fs.writeFileSync(path.join(directory, 'internal', 'helper.js'),
    "module.exports = () => ({ value: 'helper' });\n");
  fs.writeFileSync(path.join(directory, 'list-items', 'first.js'),
    "module.exports = () => ({ value: 'first' });\n");
  fs.writeFileSync(path.join(directory, 'list-items', 'nested', 'second.js'),
    "module.exports = ({ helper }) => ({ value: helper.value });\n");

  let local: ReturnType<typeof createLocalContainer>;
  const dependencies = new Proxy(Object.create(null), {
    get: (_target: object, name: string | symbol) => local.container.resolve(name as string),
  });
  local = createLocalContainer(directory, dependencies);
  const { items } = local.container.resolve('index');
  assert.deepEqual(items, [
    { name: 'first', relativePath: 'first.js', value: { value: 'first' } },
    { name: 'second', relativePath: 'nested/second.js', value: { value: 'helper' } },
  ]);
  assert.equal(items, local.container.resolve('items'));
  assert.ok(Object.isFrozen(items));
});

test('list dependency names cannot collide with a file registration', (context: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-list-collision-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'list-items'));
  fs.mkdirSync(path.join(directory, 'internal'));
  fs.writeFileSync(path.join(directory, 'internal', 'items.js'),
    'module.exports = () => ({});\n');
  assert.throws(() => createLocalContainer(directory, {}), /Duplicate module registration items/u);
});

test('module scope exposes local factories and allowed facades by module name only', () => {
  const local = { hasRegistration: (name: string) => name === 'privateHelper',
    resolve: () => 'local value' };
  const facade = Object.freeze({ publicValue: 'visible' });
  const dependencies = scopedDependencies('consumer', () => local, ['provider'],
    () => facade, Object.freeze({ clock: 'clock value' }));
  assert.equal(dependencies.privateHelper, 'local value');
  assert.throws(() => dependencies.publicValue, /forbidden dependency/u);
  assert.equal(dependencies.external.clock, 'clock value');
  assert.equal(dependencies.provider, facade);
  assert.throws(() => dependencies.privateProviderValue, /forbidden dependency/u);
  assert.throws(() => dependencies.unlistedSibling, /forbidden dependency/u);
  assert.throws(() => dependencies.fs, /forbidden dependency/u);
  assert.throws(() => dependencies.clock, /forbidden dependency/u);
});
