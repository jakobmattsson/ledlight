'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '../..');
const source = `'use strict';
module.exports = () => [
  process.pid, Buffer.from('x'), window.location, globalThis, setTimeout,
  require('fs'), module.require('fs'),
];
`;

test('implementation and surface modules reject ambient runtime dependencies', async () => {
  const eslint = new ESLint({ cwd: root });
  for (const directory of ['impl', 'surface']) {
    const [result] = await eslint.lintText(source, {
      filePath: path.join(root, 'src', directory, 'runtime-boundary-example.js'),
    });
    const globalErrors = result.messages
      .filter(({ ruleId }) => ruleId === 'no-restricted-globals')
      .map(({ message }) => message);
    for (const name of ['process', 'Buffer', 'window', 'globalThis', 'setTimeout', 'require']) {
      assert.ok(globalErrors.some((message) => message.includes(`'${name}'`)), `${directory}: ${name}`);
    }
    assert.ok(result.messages.some(({ ruleId }) => ruleId === 'no-restricted-syntax'), directory);
    assert.ok(result.messages.some(({ ruleId }) => ruleId === 'no-restricted-properties'), directory);
  }
});

test('the composition layer remains able to provide runtime dependencies', async () => {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(source, {
    filePath: path.join(root, 'src/composition/runtime-boundary-example.js'),
  });
  assert.deepEqual(result.messages, []);
});
