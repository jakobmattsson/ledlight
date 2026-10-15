'use strict';

import type { Dirent } from 'node:fs';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const { createTestRepositoryContainer } = require('@jakobm/portico/testing');

const modulesRoot = path.resolve(__dirname, '../../src/modules');
const root = path.join(modulesRoot, 'interfaces');
const sourceModulesRoot = path.resolve(__dirname, '../../../src/modules');
const sourceRoot = path.join(sourceModulesRoot, 'interfaces');
const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
const allowedModules = policy['allowed-modules'];
const allowedExternal = policy['allowed-external'];
const modules = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry: Dirent) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry: Dirent) => entry.name.slice(0, -3)).sort();

test('discovers exactly the modules declared in the dependency policy', () => {
  assert.deepEqual(fs.readdirSync(root, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory()), []);
  assert.ok(fs.statSync(path.join(sourceRoot, '..', 'external.ts')).isFile());
  assert.deepEqual(Object.keys(allowedModules).sort(), modules);
  assert.deepEqual(Object.keys(allowedExternal).sort(), modules);
  assert.deepEqual(fs.readdirSync(path.join(modulesRoot, 'implementations'), { withFileTypes: true })
    .filter((entry: Dirent) => entry.isDirectory()).map((entry: Dirent) => entry.name).sort(), modules);
  const sourceEntries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  assert.deepEqual(sourceEntries.filter((entry: Dirent) => entry.isDirectory()), []);
  assert.deepEqual(sourceEntries.filter((entry: Dirent) => entry.isFile())
    .map((entry: Dirent) => entry.name).sort(),
  modules.map((name: string) => `${name}.ts`).sort());
  assert.deepEqual(fs.readdirSync(path.join(sourceModulesRoot, 'spec')).sort(),
    ['ledger.ohm', 'schema.sql']);
  for (const name of modules) {
    const entries = fs.readdirSync(path.join(sourceModulesRoot, 'implementations', name),
      { withFileTypes: true });
    assert.ok(!(entries.length === 1 && entries[0].isDirectory() && entries[0].name === 'internal'),
      `${name} must not have an internal directory as its only child`);
  }
});

test('Ledlight facades expose only intended capabilities', () => {
  const container = createTestRepositoryContainer(path.resolve(__dirname, '../../src/modules'));
  assert.equal(Object.hasOwn(container.resolve('queries'), 'accountFilter'), false);
  assert.equal(Object.hasOwn(container.resolve('commands'), 'cliOptions'), false);
  assert.equal(Object.hasOwn(container.resolve('project'), '$$private'), false);
  assert.equal(Object.hasOwn(container.resolve('database'), 'readModelContract'), false);
  assert.equal(Object.hasOwn(container.resolve('accounting').commodityMovements, 'unpricedReplacement'), false);
  assert.equal(Object.hasOwn(container.resolve('numeric').rational, 'fraction'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'apiOptions'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'maximize'), false);
  assert.equal(Object.hasOwn(container.resolve('numeric').decimal, 'registerDecimalFunctions'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'decimal'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'rational'), false);
  assert.equal(Object.hasOwn(container.resolve('core'), 'pathsForJournal'), false);
  assert.equal(Object.hasOwn(container.resolve('project'), 'pathsForJournal'), false);
  assert.equal(Object.hasOwn(container.resolve('journal'), 'parse'), false);
  for (const [moduleName, member, formerGroup] of [
    ['accounting', 'inferEffectivePostingCosts', 'effectivePostingCosts'],
    ['accounting', 'validateGlobalAccounting', 'globalAccountingValidator'],
    ['accounting', 'valuationCommodityFromJournal', 'journalValuationCommodity'],
    ['accounting', 'PostingResolver', 'postingResolver'],
    ['cli', 'run', 'runCli'],
    ['core', 'readConfiguration', 'configuration'],
    ['core', 'appendTotal', 'reportTotals'],
    ['core', 'createLedgerValuationRateResolver', 'valuationRateResolver'],
    ['database', 'prepareDatabase', 'database'],
    ['database', 'readDatabase', 'databaseReader'],
    ['journal', 'loadJournal', 'journal'],
    ['journal', 'scanJournalSources', 'journalSourceScanner'],
    ['journal', 'parseLedgerText', 'ledgerParser'],
  ]) {
    const facade = container.resolve(moduleName);
    assert.equal(typeof facade[member], 'function', `${moduleName}.${member}`);
    assert.equal(Object.hasOwn(facade, formerGroup), false, `${moduleName}.${formerGroup}`);
  }
});
