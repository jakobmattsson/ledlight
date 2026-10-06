'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { asValue } = require('awilix');
const { createRepositoryContainer } = require('../../src/composition/repository-container');
const createReportCommand = require('../../src/cli/modules/report-command');

const SEPARATOR = '====================';

function parseArguments(command) {
  const arguments_ = [];
  let token = '';
  let quote = null;
  let started = false;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (character === '\\' && quote !== "'") {
      if (++index === command.length) throw new Error('Trailing command escape');
      token += command[index];
    } else if (character === quote) {
      quote = null;
    } else if (!quote && (character === "'" || character === '"')) {
      quote = character;
      started = true;
    } else if (!quote && /\s/u.test(character)) {
      if (started) arguments_.push(token);
      token = '';
      started = false;
    } else {
      token += character;
      started = true;
    }
  }
  if (quote) throw new Error('Unclosed command quote');
  if (started) arguments_.push(token);
  return arguments_;
}

function parseCase(fileName) {
  const lines = fs.readFileSync(fileName, 'utf8').replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  let index = 0;
  while (lines[index] === '' || lines[index]?.startsWith('#')) index += 1;
  const match = /^ledlight(?:[ \t]+(.*?))?[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u.exec(lines[index] ?? '');
  if (!match) throw new Error(`${fileName}: expected a ledlight command and LEDGER heredoc`);
  const arguments_ = parseArguments(match[1] ?? '');
  if (arguments_.length === 0) throw new Error(`${fileName}: expected a CLI command`);
  if (arguments_.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
    throw new Error(`${fileName}: the heredoc supplies the journal; omit --file`);
  }
  index += 1;
  const journalEnd = lines.indexOf('LEDGER', index);
  if (journalEnd < 0) throw new Error(`${fileName}: missing LEDGER terminator`);
  const journal = `${lines.slice(index, journalEnd).join('\n')}\n`;
  index = journalEnd + 1;
  while (lines[index] === '') index += 1;
  if (lines[index] !== SEPARATOR) throw new Error(`${fileName}: missing output separator`);
  const outputStart = ++index;
  const errorSeparator = lines.indexOf(SEPARATOR, outputStart);
  const outputEnd = errorSeparator < 0 ? lines.length : errorSeparator;
  const section = (start, end) => start === end ? '' : `${lines.slice(start, end).join('\n')}\n`;
  return {
    arguments_, journal,
    stdout: section(outputStart, outputEnd),
    stderr: errorSeparator < 0 ? '' : section(errorSeparator + 1, lines.length),
  };
}

function runCase({ arguments_, journal }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-case-'));
  const container = createRepositoryContainer();
  container.register({
    standardInput: asValue({ isTTY: () => false, read: () => journal }),
    os: asValue({ tmpdir: () => temporaryDirectory }),
  });
  const modules = {
    reportCommand: createReportCommand(container.cradle),
    cliFormat: container.resolve('cliFormat'),
  };
  let actual;
  let remaining;
  try {
    const result = modules.reportCommand.run(arguments_);
    actual = {
      stdout: result.output,
      stderr: modules.cliFormat.formatWarnings(result.warnings),
    };
  } catch (error) {
    actual = { stdout: '', stderr: `${error.message}\n` };
  } finally {
    remaining = fs.readdirSync(temporaryDirectory);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (remaining.length > 0) {
    throw new Error(`CLI stdin storage was not removed: ${remaining.join(', ')}`);
  }
  return actual;
}

module.exports = { parseCase, runCase };
