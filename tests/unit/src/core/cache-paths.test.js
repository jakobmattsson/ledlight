'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const createCachePaths = require('../../../../src/core/cache-paths');

function cachePaths(settings_) {
  const {
    canonicalPath = '/books/main.ledger',
    environment = {},
    generatedCachePath = '/system/cache/ledlight',
    pathModule = path.posix,
  } = settings_ ?? {};
  const realpathSync = () => canonicalPath;
  realpathSync.native = realpathSync;
  return createCachePaths({
    crypto,
    envPaths: (name, options) => {
      assert.equal(name, 'ledlight');
      assert.deepEqual(options, { suffix: '' });
      return { cache: generatedCachePath };
    },
    fs: {
      realpathSync,
      statSync: () => ({ isFile: () => true }),
    },
    path: pathModule,
    processEnvironment: environment,
  });
}

test('uses the application cache directory supplied by env-paths', () => {
  assert.equal(cachePaths().cacheRoot(), '/system/cache/ledlight');
});

test('honors the explicit cache override', () => {
  assert.equal(
    cachePaths({ environment: { LEDLIGHT_CACHE_HOME: '/tmp/custom-cache' } }).cacheRoot(),
    '/tmp/custom-cache',
  );
});

test('derives a deterministic database path from the canonical journal path', () => {
  const paths = cachePaths({
    canonicalPath: '/real/books/main.ledger',
    environment: { LEDLIGHT_CACHE_HOME: '/cache' },
  });
  const identity = crypto.createHash('sha256')
    .update('/real/books/main.ledger', 'utf8')
    .digest('hex');

  assert.deepEqual(paths.pathsForJournal('/books-link/main.ledger'), {
    journalPath: '/real/books/main.ledger',
    databasePath: `/cache/journals/${identity}/ledger.sqlite`,
  });
});

test('rejects missing journal paths and paths that do not name files', () => {
  assert.throws(() => cachePaths().pathsForJournal(), /journalPath must be a non-empty string/u);

  const realpathSync = () => '/books';
  realpathSync.native = realpathSync;
  const paths = createCachePaths({
    crypto,
    envPaths: () => ({ cache: '/system/cache/ledlight' }),
    fs: {
      realpathSync,
      statSync: () => ({ isFile: () => false }),
    },
    path: path.posix,
    processEnvironment: {},
  });
  assert.throws(() => paths.pathsForJournal('/books'), /Journal path is not a file/u);
});
