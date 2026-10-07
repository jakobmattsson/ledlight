'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { asValue } = require('awilix');
const espree = require('espree');
const { createRepositoryContainer } = require('../../src/impl/composition/repository-container');
const { executeCli } = require('../../src/impl/cli/execute-cli');

const HEADERS = new Map([
  ['========== CLI ==========', 'cli'],
  ['========== LEDGER-CLI ==========', 'ledgerCli'],
  ['========== API ==========', 'api'],
  ['========== FILE ==========', 'file'],
  ['========== OUTPUT ==========', 'output'],
  ['========== WARNINGS ==========', 'warnings'],
  ['========== ERROR ==========', 'error'],
]);

function parseArguments(command) {
  const args = [];
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
      if (started) args.push(token);
      token = '';
      started = false;
    } else {
      token += character;
      started = true;
    }
  }
  if (quote) throw new Error('Unclosed command quote');
  if (started) args.push(token);
  return args;
}

function apiLiteral(node) {
  if (node.type === 'Literal' && !node.regex && typeof node.value !== 'bigint') {
    return node.value;
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' &&
      node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
    return -node.argument.value;
  }
  if (node.type === 'ArrayExpression' && node.elements.every((element) => element !== null)) {
    return node.elements.map(apiLiteral);
  }
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(node.properties.map((property) => {
      if (property.type !== 'Property' || property.kind !== 'init' || property.computed ||
          property.method || property.shorthand ||
          (property.key.type !== 'Identifier' &&
            (property.key.type !== 'Literal' || typeof property.key.value !== 'string'))) {
        throw new Error('API arguments must be JavaScript literals');
      }
      const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
      return [key, apiLiteral(property.value)];
    }));
  }
  throw new Error('API arguments must be JavaScript literals');
}

function parseApi(statement) {
  if (statement.endsWith(';')) throw new Error('API statement must not end with a semicolon');
  const program = espree.parse(statement, { ecmaVersion: 'latest' });
  const expression = program.body[0]?.expression;
  if (program.body.length !== 1 || expression?.type !== 'CallExpression' ||
      expression.optional || expression.callee.type !== 'Identifier' ||
      expression.arguments.length > 1) {
    throw new Error('API must be a journal method call with at most one literal argument');
  }
  return {
    method: expression.callee.name,
    args: expression.arguments.map(apiLiteral),
  };
}

function parseCase(fileName) {
  const lines = fs.readFileSync(fileName, 'utf8').replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const sections = {};
  const files = {};
  for (let index = 0; index < lines.length;) {
    const extraFile = /^========== FILE ([^=]+) ==========$/u.exec(lines[index]);
    const name = HEADERS.get(lines[index]) ?? (extraFile ? 'extraFile' : undefined);
    if (!name) {
      if (Object.keys(sections).length > 0) {
        throw new Error(`${fileName}: text outside a section at line ${index + 1}`);
      }
      index += 1;
      continue;
    }
    if (name !== 'extraFile' && Object.hasOwn(sections, name)) {
      throw new Error(`${fileName}: duplicate ${name} section`);
    }
    let start = ++index;
    while (index < lines.length && !HEADERS.has(lines[index]) &&
      !/^========== FILE ([^=]+) ==========$/u.test(lines[index])) index += 1;
    let end = index;
    if (lines[start] === '') start += 1;
    if (lines[end - 1] === '') end -= 1;
    const content = start >= end ? '' : `${lines.slice(start, end).join('\n')}\n`;
    if (name === 'extraFile') {
      const relativePath = extraFile[1];
      if (path.isAbsolute(relativePath) || relativePath.split('/').some((part) =>
        part === '' || part === '.' || part === '..') || relativePath === 'journal.ledger') {
        throw new Error(`${fileName}: invalid FILE path ${relativePath}`);
      }
      if (Object.hasOwn(files, relativePath)) {
        throw new Error(`${fileName}: duplicate FILE path ${relativePath}`);
      }
      files[relativePath] = content;
    } else sections[name] = content;
  }
  const cli = sections.cli;
  if (cli === undefined && sections.api === undefined && sections.ledgerCli === undefined) {
    throw new Error(`${fileName}: expected a CLI, LEDGER-CLI, or API section`);
  }
  let cliArgs;
  let heredoc;
  let hasHeredoc = false;
  if (cli !== undefined) {
    const cliLines = cli.endsWith('\n') ? cli.slice(0, -1).split('\n') : cli.split('\n');
    const command = cliLines[0] ?? '';
    hasHeredoc = /[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u.test(command);
    const commandText = hasHeredoc
      ? command.replace(/[ \t]+<<(?:LEDGER|'LEDGER'|"LEDGER")$/u, '')
      : command;
    const match = /^ledlight(?:[ \t]+(.+))?$/u.exec(commandText);
    if (!match) throw new Error(`${fileName}: expected a ledlight command in CLI`);
    cliArgs = parseArguments(match[1] ?? '');
    if (cliArgs.length === 0) throw new Error(`${fileName}: expected a CLI command`);
    if (cliArgs.some((argument, index) =>
      (argument === '--file' && (!hasHeredoc || cliArgs[index + 1] !== '-')) ||
      (argument.startsWith('--file=') && (!hasHeredoc || argument !== '--file=-')))) {
      throw new Error(`${fileName}: the case supplies the journal; use --file - only for stdin`);
    }
    if (hasHeredoc) {
      const journalEnd = cliLines.indexOf('LEDGER', 1);
      if (journalEnd < 0 || journalEnd !== cliLines.length - 1) {
        throw new Error(`${fileName}: CLI needs a closing LEDGER line`);
      }
      heredoc = `${cliLines.slice(1, journalEnd).join('\n')}\n`;
    } else if (cliLines.length !== 1) {
      throw new Error(`${fileName}: CLI contains text after the command`);
    }
  }
  if (hasHeredoc === Object.hasOwn(sections, 'file')) {
    throw new Error(`${fileName}: provide exactly one of a LEDGER heredoc or FILE section`);
  }
  let ledgerArgs;
  if (sections.ledgerCli !== undefined) {
    const match = /^ledger(?:[ \t]+(.+))?\n?$/u.exec(sections.ledgerCli);
    if (!match) throw new Error(`${fileName}: expected a ledger command in LEDGER-CLI`);
    ledgerArgs = parseArguments(match[1] ?? '');
    if (ledgerArgs.length === 0) throw new Error(`${fileName}: expected a LEDGER-CLI command`);
    if (ledgerArgs.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
      throw new Error(`${fileName}: the case supplies the journal; omit --file`);
    }
  }
  if (!Object.hasOwn(sections, 'output') &&
      !Object.hasOwn(sections, 'warnings') &&
      !Object.hasOwn(sections, 'error') &&
      !Object.hasOwn(sections, 'api')) {
    throw new Error(`${fileName}: expected OUTPUT, WARNINGS, ERROR, or API`);
  }
  if (cli === undefined && sections.ledgerCli === undefined && sections.output === undefined &&
      sections.warnings === undefined && sections.error === undefined) {
    throw new Error(`${fileName}: an API-only case needs OUTPUT, WARNINGS, or ERROR`);
  }
  let api;
  if (Object.hasOwn(sections, 'api')) {
    const statement = sections.api.trim();
    if (statement === '') throw new Error(`${fileName}: API needs a JavaScript statement`);
    try {
      api = parseApi(statement);
    } catch (error) {
      throw new Error(`${fileName}: ${error.message}`, { cause: error });
    }
  }
  return {
    cliArgs, ledgerArgs, heredoc, file: sections.file, files, api,
    output: sections.output, warnings: sections.warnings, error: sections.error,
  };
}

function runCase({ cliArgs, ledgerArgs, heredoc, file, files, api }, fixtureCache) {
  // FILE inputs are immutable, so identical cases can reuse the built SQLite cache.
  // Heredoc inputs keep their separate stdin path and cleanup behavior.
  const fixtureKey = fixtureCache && file !== undefined
    ? JSON.stringify([file, files])
    : undefined;
  const cachedDirectory = fixtureKey === undefined ? undefined : fixtureCache.get(fixtureKey);
  const temporaryDirectory = cachedDirectory ?? fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-case-')),
  );
  const journalPath = path.join(temporaryDirectory, 'journal.ledger');
  if (!cachedDirectory) {
    if (file !== undefined) fs.writeFileSync(journalPath, file);
    for (const [relativePath, content] of Object.entries(files)) {
      const destination = path.join(temporaryDirectory, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }
    if (fixtureKey !== undefined) fixtureCache.set(fixtureKey, temporaryDirectory);
  }
  const container = createRepositoryContainer();
  container.register({
    standardInput: asValue({ isTTY: () => false, read: () => heredoc }),
    currentWorkingDirectory: asValue(() => temporaryDirectory),
    os: asValue({ tmpdir: () => temporaryDirectory }),
    processEnvironment: asValue({ ...process.env, LEDLIGHT_CACHE_HOME: path.join(temporaryDirectory, 'cache') }),
  });
  const modules = {
    reportCommand: container.resolve('reportCommand'),
    cliFormat: container.resolve('cliFormat'),
  };
  const actual = {};
  let remaining;
  try {
    if (cliArgs) {
      const args = file === undefined
        ? cliArgs
        : [cliArgs[0], '--file', journalPath, ...cliArgs.slice(1)];
      let output = '';
      let stderr = '';
      const exitCode = executeCli({
        ...modules,
        output: {
          writeOutput: (value) => { output += value; },
          writeError: (value) => { stderr += value; },
        },
      }, args);
      actual.cli = {
        output,
        warnings: exitCode === 0 ? stderr : '',
        error: exitCode === 1 ? stderr : '',
        exitCode,
      };
    }
    if (ledgerArgs) {
      if (heredoc !== undefined) fs.writeFileSync(journalPath, heredoc);
      const result = spawnSync(process.env.LEDGER_BIN ?? 'ledger', [
        '--file', journalPath, ...ledgerArgs,
      ], { cwd: temporaryDirectory, encoding: 'utf8' });
      if (result.error) throw result.error;
      if (result.signal) throw new Error(`Ledger terminated with signal ${result.signal}`);
      actual.ledgerCli = {
        output: result.stdout,
        warnings: result.status === 0 ? result.stderr : '',
        error: result.status === 0 ? '' : result.stderr,
        exitCode: result.status,
      };
    }
    if (api) {
      if (heredoc !== undefined) fs.writeFileSync(journalPath, heredoc);
      const resultText = { output: '', warnings: '', error: '' };
      try {
        const journalApi = container.resolve('project').openJournal(journalPath);
        const method = journalApi[api.method];
        if (!Object.hasOwn(journalApi, api.method) || typeof method !== 'function') {
          throw new Error(`Unknown API method: ${api.method}`);
        }
        const apiResult = method(...api.args);
        if (apiResult === undefined) throw new Error('API statement did not return a result');
        resultText.output = typeof apiResult === 'string'
          ? apiResult
          : modules.cliFormat.formatJson(apiResult);
        resultText.warnings = modules.cliFormat.formatWarnings(journalApi.warnings);
      } catch (error) {
        resultText.error = `${error.message}\n`;
      }
      actual.api = resultText;
    }
  } finally {
    remaining = fs.readdirSync(temporaryDirectory)
      .filter((name) => name.startsWith('ledlight-stdin-'));
    if (fixtureKey === undefined) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  if (remaining.length > 0) {
    throw new Error(`CLI stdin storage was not removed: ${remaining.join(', ')}`);
  }
  return { actual, journalPath, temporaryDirectory };
}

module.exports = { parseApi, parseCase, runCase };
