'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const withExternal = require('../../../../../support/external-dependencies.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const createConfiguration = withExternal(
  require('../../../../../../src/modules/implementations/core/configuration'),
  ['fs', 'path', 'processEnvironment', 'currentWorkingDirectory'],
);

function temporaryDirectories(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-configuration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const workingDirectory = path.join(root, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(workingDirectory);
  return { home, workingDirectory };
}

function configuration(home: string, workingDirectory: string) {
  return createConfiguration({
    fs,
    path,
    processEnvironment: { HOME: home },
    currentWorkingDirectory: () => workingDirectory,
  });
}

test('reads a quoted journal path from the project .ledlightrc', (t: TestContext) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(workingDirectory, '.ledlightrc'),
    '; The only supported setting\n\n--file "books/main ledger.ledger"\n');

  assert.deepEqual(configuration(home, workingDirectory).read(), {
    journalPath: path.join(workingDirectory, 'books/main ledger.ledger'),
    cacheHome: undefined,
  });
});

test('prefers the project .ledlightrc over the user configuration', (t: TestContext) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file ~/books/main.ledger\n');
  fs.writeFileSync(path.join(workingDirectory, '.ledlightrc'), '--file project.ledger\n');

  assert.deepEqual(configuration(home, workingDirectory).read(), {
    journalPath: path.join(workingDirectory, 'project.ledger'),
    cacheHome: undefined,
  });
});

test('falls back to the user .ledlightrc and expands its home directory', (t: TestContext) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file ~/books/main.ledger\n');

  assert.deepEqual(configuration(home, workingDirectory).read(), {
    journalPath: path.join(home, 'books/main.ledger'),
    cacheHome: undefined,
  });
});

test('finds the nearest parent configuration and resolves paths from its directory', (t: TestContext) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  const nestedDirectory = path.join(workingDirectory, 'reports', 'annual');
  fs.mkdirSync(nestedDirectory, { recursive: true });
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file home.ledger\n');
  fs.writeFileSync(path.join(workingDirectory, '.ledlightrc'),
    '--file books/main.ledger\n--cache-home .ledlight-cache\n');

  assert.deepEqual(configuration(home, nestedDirectory).read(), {
    journalPath: path.join(workingDirectory, 'books/main.ledger'),
    cacheHome: path.join(workingDirectory, '.ledlight-cache'),
  });

  fs.writeFileSync(path.join(workingDirectory, 'reports', '.ledlightrc'), '--file closer.ledger\n');
  assert.deepEqual(configuration(home, nestedDirectory).read(), {
    journalPath: path.join(workingDirectory, 'reports', 'closer.ledger'),
    cacheHome: undefined,
  });
});

test('rejects unsupported or repeated configuration settings', (t: TestContext) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  const configurationPath = path.join(workingDirectory, '.ledlightrc');
  const configured = configuration(home, workingDirectory);

  fs.writeFileSync(configurationPath, '--accounts Assets:Cash\n');
  assert.throws(() => configured.read(), /only supports --file and --cache-home options/u);

  fs.writeFileSync(configurationPath, '--file first.ledger\n--file second.ledger\n');
  assert.throws(() => configured.read(), /may only contain one --file option/u);

  fs.writeFileSync(configurationPath, '--file ""\n');
  assert.throws(() => configured.read(), /--file option expects a path/u);
});
