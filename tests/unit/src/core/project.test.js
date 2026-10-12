'use strict';

const assert = require('node:assert/strict');
const withExternal = require('../../../support/external-dependencies.js');
const path = require('node:path');
const test = require('node:test');
const createProject = withExternal(require('../../../../src/modules/project/internal/project'), ['fs', 'os', 'path']);
const { resolveRepositoryModule } = require('../../../support/repository-container');

const publicErrors = resolveRepositoryModule('src/modules/core/internal/public-errors.js');

test('reports an unexpected cache directory failure as a database error', () => {
  const project = createProject({
    cachePaths: { pathsForJournal: () => ({ databasePath: '/fixture/cache.sqlite' }) },
    fs: { mkdirSync: () => { throw new Error('cache directory is unavailable'); } },
    path,
    queries: [],
    journal: { loadJournal: () => assert.fail('must not load a journal') },
    journalWriter: { writeJournalDatabase: () => assert.fail('must not write a journal') },
    database: { ensureDatabaseCurrent: () => { throw new Error('must not rebuild'); } },
    databaseReader: { readDatabase: () => { throw new Error('must not read'); } },
    ingestionWarning: { groupWarnings: () => [] },
    publicErrors,
  });

  assert.throws(() => project.openJournal('/fixture/journal.ledger'), {
    code: 'LEDLIGHT_DATABASE',
    message: 'cache directory is unavailable',
  });
});
