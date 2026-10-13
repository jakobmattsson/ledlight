'use strict';

const assert = require('node:assert/strict');
const withExternal = require('../../../support/external-dependencies.js');
const path = require('node:path');
const test = require('node:test');
const createProject = withExternal(require('../../../../src/modules/implementations/project/project'), ['fs', 'os', 'path']);
const { resolveRepositoryModule } = require('../../../support/repository-container');

const publicErrors = resolveRepositoryModule('src/modules/implementations/core/public-errors.js');

test('reports an unexpected cache directory failure as a database error', () => {
  const project = createProject({
    core: {
      publicErrors,
    },
    cachePaths: { pathsForJournal: () => ({ databasePath: '/fixture/cache.sqlite' }) },
    fs: { mkdirSync: () => { throw new Error('cache directory is unavailable'); } },
    path,
    queries: { definitions: [] },
    journal: {
      ingestionWarning: { groupWarnings: () => [] },
    },
    database: {
      prepareDatabase: () => { throw new Error('must not rebuild'); },
      readDatabase: () => { throw new Error('must not read'); },
    },
  });

  assert.throws(() => project.openJournal('/fixture/journal.ledger'), {
    code: 'LEDLIGHT_DATABASE',
    message: 'cache directory is unavailable',
  });
});
