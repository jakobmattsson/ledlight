'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const createReportCommand = require('../../../../src/cli/modules/report-command');

function command(standardInput) {
  return createReportCommand({
    standardInput,
    cliArguments: { apiCommands: { aggregate: 'aggregate' } },
    cliCommand: {
      runReportCommandWithWarnings: (arguments_, source) => ({ arguments_, source }),
    },
  });
}

test('does not read stdin for help, version, unknown commands, explicit files, or a terminal', () => {
  const read = () => assert.fail('stdin must not be read');
  const piped = command({ isTTY: () => false, read });
  for (const arguments_ of [
    [], ['--help'], ['--version'], ['unknown'], ['aggregate', '--help'],
    ['aggregate', '--file', 'journal.ledger'], ['aggregate', '--file=-'],
  ]) {
    assert.deepEqual(piped.run(arguments_), { arguments_, source: undefined });
  }
  const terminal = command({ isTTY: () => true, read });
  assert.deepEqual(terminal.run(['aggregate']), { arguments_: ['aggregate'], source: undefined });
});

test('reads piped text once and selects stdin only for nonempty input', () => {
  let reads = 0;
  const piped = command({ isTTY: () => false, read: () => { reads += 1; return 'journal\n'; } });
  assert.deepEqual(piped.run(['aggregate', '--value']), {
    arguments_: ['aggregate', '--file', '-', '--value'], source: 'journal\n',
  });
  assert.equal(reads, 1);
  const empty = command({ isTTY: () => false, read: () => '' });
  assert.deepEqual(empty.run(['aggregate']), { arguments_: ['aggregate'], source: '' });
});
