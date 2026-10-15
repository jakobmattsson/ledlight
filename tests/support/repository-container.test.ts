'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { patchDependency, resolveTestModule } = require('./repository-container');

function temporaryDirectory(t: TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-test-container-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('patches an external dependency while retaining its other methods', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  fs.writeFileSync(path.join(directory, '.ledlightrc'), '');
  const configuration = resolveTestModule('src/modules/implementations/core/configuration.js', {
    externals: {
      currentWorkingDirectory: () => directory,
      processEnvironment: {},
      fs: patchDependency({ readFileSync: () => '--file patched.ledger\n' }),
    },
  });

  assert.deepEqual(configuration.read(), {
    journalPath: path.join(directory, 'patched.ledger'), cacheHome: undefined,
  });
});

test('uses a plain override as a complete replacement', (t: TestContext) => {
  const directory = temporaryDirectory(t);
  const configuration = resolveTestModule('src/modules/implementations/core/configuration.js', {
    externals: {
      currentWorkingDirectory: () => directory,
      processEnvironment: {},
      fs: { readFileSync: () => '--file replacement.ledger\n' },
    },
  });

  assert.throws(() => configuration.read(), /existsSync is not a function/u);
});

test('patches an internal registration without constructing it in the test', () => {
  const decimal = resolveTestModule('src/modules/implementations/numeric/decimal.js', {
    internals: {
      numeric: {
        decimal: patchDependency({ parseDecimal: () => ({ coefficient: 42n, scale: 0 }) }),
      },
    },
  });

  assert.deepEqual(decimal.parseDecimal('ignored'), { coefficient: 42n, scale: 0 });
  assert.equal(decimal.formatDecimal({ coefficient: 123n, scale: 1 }), '12.3');
});

test('rejects patching a dependency that is not an object', () => {
  assert.throws(() => resolveTestModule('src/modules/implementations/core/configuration.js', {
    externals: { currentWorkingDirectory: patchDependency({ ignored: true }) },
  }), /Cannot patch non-object dependency: currentWorkingDirectory/u);
});
