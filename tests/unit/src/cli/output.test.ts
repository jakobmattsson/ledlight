'use strict';

const assert = require('node:assert/strict');
const withExternal = require('../../../support/external-dependencies.js');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const createOutput = withExternal(require('../../../../src/modules/cli/internal/output'), ['processRuntime']);

test('writes through injected streams and handles a broken stdout pipe', () => {
  const calls: Array<[string, string | number]> = [];
  const standardOutput = new EventEmitter();
  const standardError = new EventEmitter();
  standardOutput.write = (value: string) => calls.push(['stdout', value]);
  standardError.write = (value: string) => calls.push(['stderr', value]);
  const output = createOutput({
    processRuntime: {
      exit: (code: number) => calls.push(['exit', code]),
      standardOutput,
      standardError,
    },
  });

  output.writeOutput('result\n');
  output.writeError('warning\n');
  output.handleBrokenPipe();
  standardOutput.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
  assert.deepEqual(calls, [
    ['stdout', 'result\n'],
    ['stderr', 'warning\n'],
    ['exit', 0],
  ]);

  const unexpectedError = new Error('write failed');
  assert.throws(() => standardOutput.emit('error', unexpectedError), (error: unknown) => error === unexpectedError);
});
