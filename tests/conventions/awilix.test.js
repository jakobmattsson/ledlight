'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  listModules,
  Lifetime,
} = require('../../src/lib/awilix');

test('lists exact, direct, and nested modules without duplicates', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-modules-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'direct.js'), 'module.exports = () => ({});\n');
  fs.writeFileSync(path.join(root, 'src', 'nested', 'deep-module.js'), 'module.exports = () => ({});\n');
  fs.writeFileSync(path.join(root, 'src', 'notes.txt'), 'not a module\n');

  const relativeNames = (patterns) => listModules(patterns, { cwd: root })
    .map((module) => path.relative(root, module.path).replace(/\\/gu, '/'));

  assert.deepEqual(relativeNames('src/*.js'), ['src/direct.js']);
  assert.deepEqual(relativeNames('src/**/*.js'), [
    'src/direct.js',
    'src/nested/deep-module.js',
  ]);
  assert.deepEqual(relativeNames(['src/direct.js', 'src/**/*.js']), [
    'src/direct.js',
    'src/nested/deep-module.js',
  ]);
});

test('loads modules with proxy injection and singleton lifetime', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-modules-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(
    path.join(root, 'src', 'example-module.js'),
    'module.exports = ({ answer }) => ({ answer });\n',
  );

  const container = createContainer({ injectionMode: InjectionMode.PROXY });
  container.register('answer', asValue(42));
  container.loadModules('src/*.js', {
    cwd: root,
    formatName: 'camelCase',
    resolverOptions: {
      lifetime: Lifetime.SINGLETON,
      register: asFunction,
    },
  });

  assert.equal(container.hasRegistration('exampleModule'), true);
  assert.deepEqual(container.resolve('exampleModule'), { answer: 42 });
  assert.equal(container.resolve('exampleModule'), container.resolve('exampleModule'));
});
