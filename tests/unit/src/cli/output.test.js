'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const createOutput = require('../../../../src/impl/cli/output');

test('writes through injected streams and handles a broken stdout pipe', () => {
  const calls = [];
  const standardOutput = new EventEmitter();
  const standardError = new EventEmitter();
  standardOutput.write = (value) => calls.push(['stdout', value]);
  standardError.write = (value) => calls.push(['stderr', value]);
  const output = createOutput({
    processRuntime: {
      exit: (code) => calls.push(['exit', code]),
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
  assert.throws(() => standardOutput.emit('error', unexpectedError), (error) => error === unexpectedError);
});
