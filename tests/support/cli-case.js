'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { asValue } = require('awilix');
const yaml = require('yaml');
const { createRepositoryContainer } = require('../../src/composition/repository-container');
const createReportCommand = require('../../src/cli/modules/report-command');

const HEADERS = new Map([
  ['========== FILE ==========', 'file'],
  ['========== API ==========', 'api'],
  ['========== STDOUT ==========', 'stdout'],
  ['========== STDERR ==========', 'stderr'],
]);

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
  const command = lines[index] ?? '';
  const heredoc = /[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u.test(command);
  const commandText = heredoc ? command.replace(/[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u, '') : command;
  const match = /^ledlight(?:[ \t]+(.+))?$/u.exec(commandText);
  if (!match) throw new Error(`${fileName}: expected a ledlight command`);
  const arguments_ = parseArguments(match[1] ?? '');
  if (arguments_.length === 0) throw new Error(`${fileName}: expected a CLI command`);
  if (arguments_.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
    throw new Error(`${fileName}: the case supplies the journal; omit --file`);
  }
  index += 1;
  let journal;
  if (heredoc) {
    const journalEnd = lines.indexOf('LEDGER', index);
    if (journalEnd < 0) throw new Error(`${fileName}: missing LEDGER terminator`);
    journal = `${lines.slice(index, journalEnd).join('\n')}\n`;
    index = journalEnd + 1;
  }
  while (lines[index] === '') index += 1;
  const section = (start, end) => start === end ? '' : `${lines.slice(start, end).join('\n')}\n`;
  const sections = {};
  while (index < lines.length) {
    const name = HEADERS.get(lines[index]);
    if (!name) throw new Error(`${fileName}: unknown section header at line ${index + 1}`);
    if (Object.hasOwn(sections, name)) throw new Error(`${fileName}: duplicate ${name} section`);
    const start = ++index;
    while (index < lines.length && !HEADERS.has(lines[index])) index += 1;
    sections[name] = section(start, index);
  }
  if (heredoc === Object.hasOwn(sections, 'file')) {
    throw new Error(`${fileName}: provide exactly one of a LEDGER heredoc or FILE section`);
  }
  journal ??= sections.file;
  if (!Object.hasOwn(sections, 'stdout') &&
      !Object.hasOwn(sections, 'stderr') &&
      !Object.hasOwn(sections, 'api')) {
    throw new Error(`${fileName}: expected STDOUT, STDERR, or API`);
  }
  let api;
  if (Object.hasOwn(sections, 'api')) {
    const call = /^([a-z][A-Za-z0-9]*)\s*\(([\s\S]*)\)$/u.exec(sections.api.trim());
    if (!call) throw new Error(`${fileName}: API must contain a journal method call`);
    const options = call[2].trim() === '' ? {} : yaml.parse(call[2]);
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error(`${fileName}: API arguments must be an object`);
    }
    api = { method: call[1], options };
  }
  return { arguments_, journal, file: !heredoc, api, stdout: sections.stdout, stderr: sections.stderr };
}

function runCase({ arguments_, journal, file, api }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-case-'));
  const journalPath = path.join(temporaryDirectory, 'journal.ledger');
  if (file || api) fs.writeFileSync(journalPath, journal);
  const container = createRepositoryContainer();
  container.register({
    standardInput: asValue({ isTTY: () => false, read: () => journal }),
    os: asValue({ tmpdir: () => temporaryDirectory }),
    processEnvironment: asValue({ ...process.env, LEDLIGHT_CACHE_HOME: path.join(temporaryDirectory, 'cache') }),
  });
  const modules = {
    reportCommand: createReportCommand(container.cradle),
    cliFormat: container.resolve('cliFormat'),
  };
  let actual;
  let remaining;
  try {
    try {
      const cliArguments = file ? [arguments_[0], '--file', journalPath, ...arguments_.slice(1)] : arguments_;
      const result = modules.reportCommand.run(cliArguments);
      actual = {
        stdout: result.output,
        stderr: modules.cliFormat.formatWarnings(result.warnings),
      };
    } catch (error) {
      actual = { stdout: '', stderr: `${error.message}\n` };
    }
    if (api) {
      const journalApi = container.resolve('project').openJournal(journalPath);
      if (!Object.hasOwn(journalApi, api.method) || typeof journalApi[api.method] !== 'function') {
        throw new Error(`Unknown journal API method: ${api.method}`);
      }
      actual.apiResult = journalApi[api.method](api.options);
    }
  } finally {
    remaining = fs.readdirSync(temporaryDirectory)
      .filter((name) => name.startsWith('ledlight-stdin-'));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (remaining.length > 0) {
    throw new Error(`CLI stdin storage was not removed: ${remaining.join(', ')}`);
  }
  return actual;
}

module.exports = { parseCase, runCase };
