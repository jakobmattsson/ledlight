'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '../../..');
const source = `'use strict';
module.exports = () => [
  process.pid, Buffer.from('x'), window.location, globalThis, setTimeout,
  require('fs'), module.require('fs'),
];
`;

test('repository modules reject ambient runtime dependencies', async () => {
  const eslint = new ESLint({ cwd: root });
  for (const directory of ['modules/core', 'modules/queries']) {
    const [result] = await eslint.lintText(source, {
      filePath: path.join(root, 'src', directory, 'runtime-boundary-example.ts'),
    });
    const globalErrors = result.messages
      .filter(({ ruleId }: { ruleId: string }) => ruleId === 'no-restricted-globals')
      .map(({ message }: { message: string }) => message);
    for (const name of ['process', 'Buffer', 'window', 'globalThis', 'setTimeout', 'require']) {
      assert.ok(globalErrors.some((message: string) => message.includes(`'${name}'`)), `${directory}: ${name}`);
    }
    assert.ok(result.messages.some(({ ruleId }: { ruleId: string }) => ruleId === 'no-restricted-syntax'), directory);
    assert.ok(result.messages.some(({ ruleId }: { ruleId: string }) => ruleId === 'no-restricted-properties'), directory);
  }
});

test('composition and the external service factory can provide runtime dependencies', async () => {
  const eslint = new ESLint({ cwd: root });
  for (const filePath of [
    'src/composition/runtime-boundary-example.ts',
    'src/modules/external.ts',
  ]) {
    const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
    assert.deepEqual(result.messages, [], filePath);
  }
});
