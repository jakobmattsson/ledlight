'use strict';

const assert = require('node:assert/strict');
const withExternal = require('../../../support/external-dependencies.js');
const test = require('node:test');
const createRunCli = withExternal(require('../../../../src/modules/cli/internal/run-cli'), ['processRuntime']);

function runWithExitCode(exitCode: any) {
  const calls: any = [];
  const runCli = createRunCli({
    executeCli: {
      run(arguments_: any) {
        calls.push(['run', arguments_]);
        return exitCode;
      },
    },
    output: { handleBrokenPipe: () => calls.push(['handleBrokenPipe']) },
    processRuntime: {
      commandLineArguments: () => ['--version'],
      setExitCode: (code: any) => calls.push(['setExitCode', code]),
    },
  });
  runCli.run();
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
