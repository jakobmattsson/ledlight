'use strict';

const { resolveRepositoryModule } = require("../../../../support/repository-container");

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadJournal } = resolveRepositoryModule("src/impl/ingestion/journal/journal.js");
const { loadJournalManifest } = resolveRepositoryModule("src/impl/ingestion/journal/journal-manifest.js");

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-journal-loader-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('expands include globs in deterministic path order', (t) => {
  const directory = temporaryDirectory(t);
  const partsDirectory = path.join(directory, 'parts');
  fs.mkdirSync(partsDirectory);
  const journalPath = path.join(directory, 'all.ledger');
  const firstPath = path.join(partsDirectory, 'a.ledger');
  const secondPath = path.join(partsDirectory, 'b.ledger');
  fs.writeFileSync(journalPath, 'include parts/*.ledger\n');
  fs.writeFileSync(firstPath, 'account Assets:First\n');
  fs.writeFileSync(secondPath, 'account Assets:Second\n');

  const journal = loadJournal(journalPath);
  assert.deepEqual(journal.entries.map((entry) => entry.name), ['Assets:First', 'Assets:Second']);
  assert.deepEqual(journal.files.map((file) => file.path), [journalPath, firstPath, secondPath]);
  assert.deepEqual(loadJournalManifest(journalPath), {
    journalPath,
    files: journal.files,
  });
});

test('rejects circular includes in full and manifest-only loading', (t) => {
  const directory = temporaryDirectory(t);
  const firstPath = path.join(directory, 'first.ledger');
  const secondPath = path.join(directory, 'second.ledger');
  fs.writeFileSync(firstPath, 'include second.ledger\n');
  fs.writeFileSync(secondPath, 'include first.ledger\n');

  assert.throws(() => loadJournal(firstPath), /Circular include detected/u);
  assert.throws(() => loadJournalManifest(firstPath), /Circular include detected/u);
});

test('rejects include patterns that match no files', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.mkdirSync(path.join(directory, 'missing'));
  fs.writeFileSync(journalPath, 'include missing/*.ledger\n');

  assert.throws(() => loadJournal(journalPath), /include matched no files/u);
  assert.throws(() => loadJournalManifest(journalPath), /include matched no files/u);
});

test('reports missing include directories as unmatched patterns', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.writeFileSync(journalPath, 'include absent/*.ledger\n');

  assert.throws(
    () => loadJournal(journalPath),
    new RegExp(`${journalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:1: include matched no files`, 'u'),
  );
  assert.throws(
    () => loadJournalManifest(journalPath),
    new RegExp(`${journalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: include matched no files`, 'u'),
  );
});

test('rejects wildcards in include directory components', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  fs.writeFileSync(journalPath, 'include parts*/item?.ledger\n');

  assert.throws(() => loadJournal(journalPath), /Wildcards in include directories are not supported/u);
  assert.throws(() => loadJournalManifest(journalPath), /Wildcards in include directories are not supported/u);
});

test('loads a file once when multiple include branches reach it', (t) => {
  const directory = temporaryDirectory(t);
  const journalPath = path.join(directory, 'all.ledger');
  const firstBranchPath = path.join(directory, 'first.ledger');
  const secondBranchPath = path.join(directory, 'second.ledger');
  const sharedPath = path.join(directory, 'shared.ledger');
  fs.writeFileSync(journalPath, 'include first.ledger\ninclude second.ledger\n');
  fs.writeFileSync(firstBranchPath, 'include shared.ledger\naccount Assets:First\n');
  fs.writeFileSync(secondBranchPath, 'include shared.ledger\naccount Assets:Second\n');
  fs.writeFileSync(sharedPath, 'account Assets:Shared\n');

  const journal = loadJournal(journalPath);
  assert.deepEqual(
    journal.entries.map((entry) => entry.name),
    ['Assets:Shared', 'Assets:First', 'Assets:Second'],
  );
  assert.deepEqual(
    journal.files.map((file) => file.path),
    [journalPath, firstBranchPath, sharedPath, secondBranchPath],
  );
  assert.deepEqual(
    loadJournalManifest(journalPath).files.map((file) => file.path),
    [journalPath, firstBranchPath, sharedPath, secondBranchPath],
  );
});
