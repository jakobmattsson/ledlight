'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const createCachePaths = require('../../../../src/application/cache-paths');

function cachePaths(settings_) {
  const {
    canonicalPath = '/books/main.ledger',
    environment = {},
    homedir = '/home/example',
    pathModule = path.posix,
    platform = 'linux',
  } = settings_ ?? {};
  const realpathSync = () => canonicalPath;
  realpathSync.native = realpathSync;
  return createCachePaths({
    crypto,
    fs: {
      realpathSync,
      statSync: () => ({ isFile: () => true }),
    },
    os: { homedir: () => homedir },
    path: pathModule,
    processEnvironment: environment,
    processPlatform: platform,
  });
}

test('uses the native application cache directory on each supported platform', () => {
  assert.equal(
    cachePaths({ platform: 'darwin', homedir: '/Users/example' }).cacheRoot(),
    '/Users/example/Library/Caches/ledlight',
  );
  assert.equal(
    cachePaths({ environment: { XDG_CACHE_HOME: '/var/cache/example' } }).cacheRoot(),
    '/var/cache/example/ledlight',
  );
  assert.equal(
    cachePaths().cacheRoot(),
    '/home/example/.cache/ledlight',
  );
  assert.equal(
    cachePaths({ environment: { XDG_CACHE_HOME: 'relative-cache' } }).cacheRoot(),
    '/home/example/.cache/ledlight',
  );
  assert.equal(
    cachePaths({
      environment: { LOCALAPPDATA: 'C:\\Users\\example\\AppData\\Local' },
      homedir: 'C:\\Users\\example',
      pathModule: path.win32,
      platform: 'win32',
    }).cacheRoot(),
    'C:\\Users\\example\\AppData\\Local\\ledlight\\Cache',
  );
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
    fs: {
      realpathSync,
      statSync: () => ({ isFile: () => false }),
    },
    os: { homedir: () => '/home/example' },
    path: path.posix,
    processEnvironment: {},
    processPlatform: 'linux',
  });
  assert.throws(() => paths.pathsForJournal('/books'), /Journal path is not a file/u);
});
