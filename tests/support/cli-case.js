'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { asValue } = require('awilix');
const { createRepositoryContainer } = require('../../src/composition/repository-container');
const createReportCommand = require('../../src/cli/modules/report-command');

const HEADERS = new Map([
  ['========== CLI ==========', 'cli'],
  ['========== API ==========', 'api'],
  ['========== FILE ==========', 'file'],
  ['========== OUTPUT ==========', 'output'],
  ['========== WARNINGS ==========', 'warnings'],
  ['========== ERROR ==========', 'error'],
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
  const sections = {};
  for (let index = 0; index < lines.length;) {
    const name = HEADERS.get(lines[index]);
    if (!name) {
      if (Object.keys(sections).length > 0) {
        throw new Error(`${fileName}: text outside a section at line ${index + 1}`);
      }
      index += 1;
      continue;
    }
    if (Object.hasOwn(sections, name)) throw new Error(`${fileName}: duplicate ${name} section`);
    let start = ++index;
    while (index < lines.length && !HEADERS.has(lines[index])) index += 1;
    let end = index;
    if (lines[start] === '') start += 1;
    if (lines[end - 1] === '') end -= 1;
    sections[name] = start >= end ? '' : `${lines.slice(start, end).join('\n')}\n`;
  }
  const cli = sections.cli;
  if (cli === undefined && sections.api === undefined) {
    throw new Error(`${fileName}: expected a CLI or API section`);
  }
  let arguments_;
  let journal;
  let heredoc = false;
  if (cli !== undefined) {
    const cliLines = cli.endsWith('\n') ? cli.slice(0, -1).split('\n') : cli.split('\n');
    const command = cliLines[0] ?? '';
    heredoc = /[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u.test(command);
    const commandText = heredoc
      ? command.replace(/[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u, '')
      : command;
    const match = /^ledlight(?:[ \t]+(.+))?$/u.exec(commandText);
    if (!match) throw new Error(`${fileName}: expected a ledlight command in CLI`);
    arguments_ = parseArguments(match[1] ?? '');
    if (arguments_.length === 0) throw new Error(`${fileName}: expected a CLI command`);
    if (arguments_.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
      throw new Error(`${fileName}: the case supplies the journal; omit --file`);
    }
    if (heredoc) {
      const journalEnd = cliLines.indexOf('LEDGER', 1);
      if (journalEnd < 0 || journalEnd !== cliLines.length - 1) {
        throw new Error(`${fileName}: CLI needs a closing LEDGER line`);
      }
      journal = `${cliLines.slice(1, journalEnd).join('\n')}\n`;
    } else if (cliLines.length !== 1) {
      throw new Error(`${fileName}: CLI contains text after the command`);
    }
  }
  if (heredoc === Object.hasOwn(sections, 'file')) {
    throw new Error(`${fileName}: provide exactly one of a LEDGER heredoc or FILE section`);
  }
  journal ??= sections.file;
  if (!Object.hasOwn(sections, 'output') &&
      !Object.hasOwn(sections, 'warnings') &&
      !Object.hasOwn(sections, 'error') &&
      !Object.hasOwn(sections, 'api')) {
    throw new Error(`${fileName}: expected OUTPUT, WARNINGS, ERROR, or API`);
  }
  if (cli === undefined && sections.output === undefined &&
      sections.warnings === undefined && sections.error === undefined) {
    throw new Error(`${fileName}: an API-only case needs OUTPUT, WARNINGS, or ERROR`);
  }
  let api;
  if (Object.hasOwn(sections, 'api')) {
    const statement = sections.api.trim();
    if (statement === '') throw new Error(`${fileName}: API needs a JavaScript statement`);
    api = { statement: new vm.Script(statement, { filename: fileName }) };
  }
  return {
    arguments_, journal, file: !heredoc, api,
    output: sections.output, warnings: sections.warnings, error: sections.error,
  };
}

function runCase({ arguments_, journal, file, api }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-cli-case-'));
  const journalPath = path.join(temporaryDirectory, 'journal.ledger');
  if (file) fs.writeFileSync(journalPath, journal);
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
  const actual = { output: '', warnings: '', error: '' };
  let remaining;
  try {
    if (arguments_) {
      try {
        const cliArguments = file ? [arguments_[0], '--file', journalPath, ...arguments_.slice(1)] : arguments_;
        const result = modules.reportCommand.run(cliArguments);
        actual.output = result.output;
        actual.warnings = modules.cliFormat.formatWarnings(result.warnings);
        actual.cliExitCode = 0;
      } catch (error) {
        actual.error = `${error.message}\n`;
        actual.cliExitCode = 1;
      }
    }
    if (api) {
      if (!file) fs.writeFileSync(journalPath, journal);
      try {
        const journalApi = container.resolve('project').openJournal(journalPath);
        const bindings = Object.fromEntries(Object.entries(journalApi)
          .filter(([, value]) => typeof value === 'function')
          .map(([name, method]) => [name, method.bind(journalApi)]));
        const apiResult = api.statement.runInNewContext(bindings, { timeout: 1000 });
        if (apiResult === undefined) throw new Error('API statement did not return a result');
        if (arguments_) actual.apiResult = apiResult;
        else {
          actual.output = `${JSON.stringify(apiResult, null, 2)}\n`;
          actual.warnings = modules.cliFormat.formatWarnings(journalApi.warnings);
        }
      } catch (error) {
        actual.apiError = `${error.message}\n`;
        if (!arguments_) actual.error = actual.apiError;
      }
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
