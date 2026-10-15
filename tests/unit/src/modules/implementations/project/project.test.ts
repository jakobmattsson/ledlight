'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { resolveTestModule } = require('../../../../../support/repository-container');

test('reports an unexpected cache directory failure as a database error', () => {
  const project = resolveTestModule('src/modules/implementations/project/project.js', {
    externals: {
      fs: { ...fs, mkdirSync: () => { throw new Error('cache directory is unavailable'); } },
    },
    internals: {
      database: {
        database: { prepareDatabase: () => assert.fail('must not rebuild') },
        databaseReader: { readDatabase: () => assert.fail('must not read') },
      },
      project: {
        cachePaths: { pathsForJournal: () => ({ databasePath: '/fixture/cache.sqlite' }) },
      },
    },
  });

  assert.throws(() => project.openJournal('/fixture/journal.ledger'), {
    code: 'LEDLIGHT_DATABASE',
    message: 'cache directory is unavailable',
  });
});
