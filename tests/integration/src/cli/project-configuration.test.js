'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { asValue } = require('../../../../src/lib/awilix');
const { createRepositoryContainer } = require('../../../../src/composition/repository-container');

test('CLI and API use the project cache while API uses its explicit journal', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-project-configuration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectDirectory = path.join(root, 'project');
  const workingDirectory = path.join(projectDirectory, 'reports');
  const home = path.join(root, 'home');
  fs.mkdirSync(workingDirectory, { recursive: true });
  fs.mkdirSync(home);
  const journalPath = path.join(projectDirectory, 'main.ledger');
  const otherJournalPath = path.join(root, 'other.ledger');
  const source = 'commodity SEK\n  default\naccount Assets:Cash\naccount Equity:Opening\n2024-01-01 Opening\n  Assets:Cash  1 SEK\n  Equity:Opening  -1 SEK\n';
  fs.writeFileSync(journalPath, source);
  fs.writeFileSync(otherJournalPath, source);
  fs.writeFileSync(path.join(projectDirectory, '.ledlightrc'),
    '--file main.ledger\n--cache-home .ledlight-cache\n');

  const container = createRepositoryContainer();
  const environment = { ...process.env, HOME: home };
  delete environment.LEDLIGHT_CACHE_HOME;
  container.register({
    currentWorkingDirectory: asValue(() => workingDirectory),
    processEnvironment: asValue(environment),
  });

  const output = container.resolve('cliCommand').runReportCommand(['aggregate', '--format', 'json']);
  assert.ok(JSON.parse(output));
  const journalsDirectory = path.join(projectDirectory, '.ledlight-cache', 'journals');
  assert.equal(fs.readdirSync(journalsDirectory).length, 1);
  const journal = container.resolve('project').openJournal(otherJournalPath);
  assert.equal(journal.journalPath, fs.realpathSync.native(otherJournalPath));
  assert.ok(journal.databasePath.startsWith(journalsDirectory));
  assert.ok(fs.existsSync(journal.databasePath));
  assert.equal(fs.readdirSync(journalsDirectory).length, 2);

  environment.LEDLIGHT_CACHE_HOME = path.join(root, 'environment-cache');
  const overridden = container.resolve('project').openJournal(otherJournalPath);
  assert.ok(overridden.databasePath.startsWith(path.join(root, 'environment-cache', 'journals')));
});
