'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const commander = require('commander');
const { resolveCommands, resolveRepositoryModule } = require('../support/repository-container');
const createArguments = require('../../src/impl/cli/cli-arguments');

const commands = resolveCommands();
const project = resolveRepositoryModule('src/impl/core/project.js');
const argumentsModule = createArguments({
  commander,
  commands,
  cliConfiguration: { apply: (arguments_) => arguments_ },
  project,
});

test('defines exactly one CLI command for every public journal operation', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-api-contract-'));
  const previousCacheHome = process.env.LEDLIGHT_CACHE_HOME;
  process.env.LEDLIGHT_CACHE_HOME = path.join(directory, 'cache');
  t.after(() => {
    if (previousCacheHome === undefined) delete process.env.LEDLIGHT_CACHE_HOME;
    else process.env.LEDLIGHT_CACHE_HOME = previousCacheHome;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const journalPath = path.join(directory, 'journal.ledger');
  fs.writeFileSync(journalPath, 'commodity SEK\n  default\naccount Assets:Cash\n');
  const { openJournal } = require('../..');
  const journal = openJournal(journalPath);
  const journalOperations = Object.entries(journal)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
  assert.deepEqual(commands.map(({ operation }) => operation).sort(), journalOperations.sort());
  assert.deepEqual(
    argumentsModule.apiCommands,
    Object.fromEntries(commands.map(({ operation, name }) => [operation, name])),
  );
});

test('fails when a locally declared API input has no actual CLI option', () => {
  const apiDefinitions = {
    ...project.apiDefinitions,
    aggregate: {
      inputs: [...project.apiDefinitions.aggregate.inputs, 'futureOption'],
    },
  };
  assert.throws(
    () => createArguments({
      commander,
      commands,
      cliConfiguration: { apply: (arguments_) => arguments_ },
      project: { apiDefinitions },
    }),
    /CLI inputs do not cover the aggregate API contract/u,
  );
});

test('tracks API inputs separately from CLI-only output inputs', () => {
  assert.deepEqual(argumentsModule.apiInputCoverage.accounts, {
    command: 'accounts',
    inputs: ['journalPath', 'accounts', 'usage'],
    outputInputs: ['details', 'format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.transactions, {
    command: 'transactions',
    inputs: ['journalPath', 'accounts', 'id', 'order', 'page', 'pageSize'],
    outputInputs: ['format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.postings, {
    command: 'postings',
    inputs: ['journalPath', 'from', 'to', 'accounts'],
    outputInputs: ['format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.aggregate.outputInputs, ['format']);
  assert.deepEqual(
    argumentsModule.apiInputCoverage.unrealizedGains.outputInputs,
    ['format', 'includeTotal'],
  );
  assert.deepEqual(argumentsModule.apiInputCoverage.totalHistory, {
    command: 'total-history',
    inputs: ['journalPath', 'from', 'to', 'accounts', 'dateBasis', 'valuation', 'invert'],
    outputInputs: ['format'],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.investmentPerformance.outputInputs, ['format']);
  assert.deepEqual(argumentsModule.apiInputCoverage.print, {
    command: 'print',
    inputs: ['journalPath', 'density', 'sortDeclarations'],
    outputInputs: [],
  });
  assert.deepEqual(argumentsModule.apiInputCoverage.validate, {
    command: 'validate',
    inputs: ['journalPath'],
    outputInputs: [],
  });
});
