'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const createConfiguration = require('../../../../src/impl/cli/cli-configuration');
const createProjectConfiguration = require('../../../../src/impl/core/configuration');

function temporaryDirectories(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-configuration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const workingDirectory = path.join(root, 'project');
  fs.mkdirSync(home);
  fs.mkdirSync(workingDirectory);
  return { home, workingDirectory };
}

function configuration(home, workingDirectory) {
  return createConfiguration({ configuration: createProjectConfiguration({
    fs,
    path,
    processEnvironment: { HOME: home },
    currentWorkingDirectory: () => workingDirectory,
  }) });
}

test('supplies --file from the project .ledlightrc', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(
    path.join(workingDirectory, '.ledlightrc'),
    '; The only supported setting\n\n--file "books/main ledger.ledger"\n',
  );

  assert.deepEqual(
    configuration(home, workingDirectory).apply(['aggregate', '--format', 'csv']),
    ['aggregate', '--file', path.join(workingDirectory, 'books/main ledger.ledger'), '--format', 'csv'],
  );
});

test('prefers the project .ledlightrc over the user configuration', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file ~/books/main.ledger\n');
  fs.writeFileSync(path.join(workingDirectory, '.ledlightrc'), '--file project.ledger\n');

  assert.deepEqual(
    configuration(home, workingDirectory).apply(['unrealized-gains']),
    ['unrealized-gains', '--file', path.join(workingDirectory, 'project.ledger')],
  );
});

test('falls back to the user .ledlightrc and expands its home directory', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file ~/books/main.ledger\n');

  assert.deepEqual(
    configuration(home, workingDirectory).apply(['unrealized-gains']),
    ['unrealized-gains', '--file', path.join(home, 'books/main.ledger')],
  );
});

test('finds the nearest parent configuration and resolves paths from its directory', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  const nestedDirectory = path.join(workingDirectory, 'reports', 'annual');
  fs.mkdirSync(nestedDirectory, { recursive: true });
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--file home.ledger\n');
  fs.writeFileSync(path.join(workingDirectory, '.ledlightrc'),
    '--file books/main.ledger\n--cache-home .ledlight-cache\n');

  assert.deepEqual(configuration(home, nestedDirectory).apply(['aggregate']),
    ['aggregate', '--file', path.join(workingDirectory, 'books/main.ledger')]);

  fs.writeFileSync(path.join(workingDirectory, 'reports', '.ledlightrc'), '--file closer.ledger\n');
  assert.deepEqual(configuration(home, nestedDirectory).apply(['aggregate']),
    ['aggregate', '--file', path.join(workingDirectory, 'reports', 'closer.ledger')]);
});

test('lets an explicit --file option override configuration', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  fs.writeFileSync(path.join(home, '.ledlightrc'), '--unknown value\n');

  assert.deepEqual(
    configuration(home, workingDirectory).apply(['aggregate', '--file', 'explicit.ledger']),
    ['aggregate', '--file', 'explicit.ledger'],
  );
});

test('rejects unsupported or repeated configuration settings', (t) => {
  const { home, workingDirectory } = temporaryDirectories(t);
  const configurationPath = path.join(workingDirectory, '.ledlightrc');
  const configuredArguments = configuration(home, workingDirectory);

  fs.writeFileSync(configurationPath, '--accounts Assets:Cash\n');
  assert.throws(() => configuredArguments.apply(['aggregate']), /only supports --file and --cache-home options/u);

  fs.writeFileSync(configurationPath, '--file first.ledger\n--file second.ledger\n');
  assert.throws(() => configuredArguments.apply(['aggregate']), /may only contain one --file option/u);

  fs.writeFileSync(configurationPath, '--file ""\n');
  assert.throws(() => configuredArguments.apply(['aggregate']), /--file option expects a path/u);
});
