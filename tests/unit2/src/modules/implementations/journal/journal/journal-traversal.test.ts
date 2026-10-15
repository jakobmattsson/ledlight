'use strict';

import type { TestContext } from 'node:test';

const { resolveRepositoryModule } = require("../../../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadJournal } = resolveRepositoryModule("src/modules/implementations/journal/journal/journal.js");
const { scanJournalSources } = resolveRepositoryModule("src/modules/implementations/journal/journal/journal-source-scanner.js");

function temporaryDirectory(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-journal-loader-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('expands include globs in deterministic path order', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const partsDirectory = path.join(directory, 'parts');
  fs.mkdirSync(partsDirectory);
  const journalPath = path.join(directory, 'all.ledger');
  const firstPath = path.join(partsDirectory, 'a.ledger');
  const secondPath = path.join(partsDirectory, 'b.ledger');
  fs.writeFileSync(journalPath, 'include parts/*.ledger\n');
  fs.writeFileSync(firstPath, 'account Assets:First\n');
  fs.writeFileSync(secondPath, 'account Assets:Second\n');

  const journal = loadJournal({ kind: 'file', path: journalPath });
  assert.deepEqual(journal.entries.map((entry: any) => entry.name), ['Assets:First', 'Assets:Second']);
  assert.deepEqual(journal.files.map((file: { path: string }) => file.path), [journalPath, firstPath, secondPath]);
  assert.deepEqual(scanJournalSources(journalPath), {
    journalPath,
    files: journal.files,
  });
});

test('rejects circular includes in full loading and source scanning', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const firstPath = path.join(directory, 'first.ledger');
  const secondPath = path.join(directory, 'second.ledger');
  fs.writeFileSync(firstPath, 'include second.ledger\n');
  fs.writeFileSync(secondPath, 'include first.ledger\n');

  assert.throws(() => loadJournal({ kind: 'file', path: firstPath }), /Circular include detected/u);
  assert.throws(() => scanJournalSources(firstPath), /Circular include detected/u);
});

test('rejects include patterns that match no files', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.mkdirSync(path.join(directory, 'missing'));
  fs.writeFileSync(journalPath, 'include missing/*.ledger\n');

  assert.throws(() => loadJournal({ kind: 'file', path: journalPath }), /include matched no files/u);
  assert.throws(() => scanJournalSources(journalPath), /include matched no files/u);
});

test('reports missing include directories as unmatched patterns', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.writeFileSync(journalPath, 'include absent/*.ledger\n');

  assert.throws(
    () => loadJournal({ kind: 'file', path: journalPath }),
    new RegExp(`${journalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:1: include matched no files`, 'u'),
  );
  assert.throws(
    () => scanJournalSources(journalPath),
    new RegExp(`${journalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: include matched no files`, 'u'),
  );
});

test('rejects wildcards in include directory components', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.writeFileSync(journalPath, 'include parts*/item?.ledger\n');

  assert.throws(() => loadJournal({ kind: 'file', path: journalPath }), /Wildcards in include directories are not supported/u);
  assert.throws(() => scanJournalSources(journalPath), /Wildcards in include directories are not supported/u);
});

test('loads a file once when multiple include branches reach it', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  const firstBranchPath = path.join(directory, 'first.ledger');
  const secondBranchPath = path.join(directory, 'second.ledger');
  const sharedPath = path.join(directory, 'shared.ledger');
  fs.writeFileSync(journalPath, 'include first.ledger\ninclude second.ledger\n');
  fs.writeFileSync(firstBranchPath, 'include shared.ledger\naccount Assets:First\n');
  fs.writeFileSync(secondBranchPath, 'include shared.ledger\naccount Assets:Second\n');
  fs.writeFileSync(sharedPath, 'account Assets:Shared\n');

  const journal = loadJournal({ kind: 'file', path: journalPath });
  assert.deepEqual(
    journal.entries.map((entry: any) => entry.name),
    ['Assets:Shared', 'Assets:First', 'Assets:Second'],
  );
  assert.deepEqual(
    journal.files.map((file: { path: string }) => file.path),
    [journalPath, firstBranchPath, sharedPath, secondBranchPath],
  );
  assert.deepEqual(
    scanJournalSources(journalPath).files.map((file: { path: string }) => file.path),
    [journalPath, firstBranchPath, sharedPath, secondBranchPath],
  );
});
