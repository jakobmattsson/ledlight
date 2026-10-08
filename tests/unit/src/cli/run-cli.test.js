'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { asValue } = require('../../../../src/lib/awilix');
const { createRepositoryContainer } = require('../../../../src/composition/repository-container');

function runWithExitCode(exitCode) {
  const calls = [];
  const container = createRepositoryContainer();
  container.register({
    executeCli: asValue({
      run(arguments_) {
        calls.push(['run', arguments_]);
        return exitCode;
      },
    }),
    output: asValue({ handleBrokenPipe: () => calls.push(['handleBrokenPipe']) }),
    processRuntime: asValue({
      commandLineArguments: () => ['--version'],
      setExitCode: (code) => calls.push(['setExitCode', code]),
    }),
  });
  container.resolve('runCli').run();
  return calls;
}

test('the CLI entrypoint passes injected arguments and a failing exit code', () => {
  assert.deepEqual(runWithExitCode(1), [
    ['handleBrokenPipe'],
    ['run', ['--version']],
    ['setExitCode', 1],
  ]);
});

test('the CLI entrypoint leaves the process exit code alone after success', () => {
  assert.deepEqual(runWithExitCode(0), [
    ['handleBrokenPipe'],
    ['run', ['--version']],
  ]);
});
