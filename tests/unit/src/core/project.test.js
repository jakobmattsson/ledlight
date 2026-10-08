'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const createProject = require('../../../../src/impl/core/project');
const { resolveRepositoryModule } = require('../../../support/repository-container');

const publicErrors = resolveRepositoryModule('src/impl/core/public-errors.js');

test('reports an unexpected cache directory failure as a database error', () => {
  const project = createProject({
    cachePaths: { pathsForJournal: () => ({ databasePath: '/fixture/cache.sqlite' }) },
    fs: { mkdirSync: () => { throw new Error('cache directory is unavailable'); } },
    path,
    queries: [],
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
