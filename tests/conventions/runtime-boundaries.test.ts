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
  for (const directory of ['modules/interfaces', 'modules/implementations/queries']) {
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

test('implementation factories cannot forward another module\'s injected capability', async () => {
  const eslint = new ESLint({ cwd: root });
  const filePath = path.join(root, 'src/modules/implementations/queries/support/forwarded-example.ts');
  const [result] = await eslint.lintText(`module.exports = ({ core: { borrowed }, localHelper }) => {
  const alias = { borrowed };
  return { ...alias, localHelper, own: () => borrowed(), $$private: { borrowed } };
};
`, { filePath });
  const errors = result.messages.filter(({ ruleId }: { ruleId: string | null }) =>
    ruleId === 'architecture/no-forwarded-module-dependencies');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /forwarding borrowed/u);
});
