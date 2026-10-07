'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const packageMetadata = require('../../package.json');

function run(command, arguments_, options) {
  return execFileSync(command, arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runNpm(arguments_, options) {
  assert.ok(process.env.npm_execpath, 'npm_execpath must identify the npm CLI');
  return run(process.execPath, [process.env.npm_execpath, ...arguments_], options);
}

test('the published archive installs and exposes the module and CLI', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-package-'));
  try {
    const archiveDirectory = path.join(temporaryDirectory, 'archive');
    const consumerDirectory = path.join(temporaryDirectory, 'consumer');
    fs.mkdirSync(archiveDirectory);
    fs.mkdirSync(consumerDirectory);

    const packResult = JSON.parse(runNpm([
      'pack',
      '--json',
      '--pack-destination', archiveDirectory,
    ], { cwd: repositoryRoot }))[0];
    const packagedPaths = new Set(packResult.files.map(({ path: packagedPath }) => packagedPath));
    for (const requiredPath of [
      'LICENSE',
      'README.md',
      'docs/api.md',
      'docs/ledger-cli-equivalence.md',
      'docs/ledlight.md',
      'docs/package.md',
      'src/index.js',
      'package.json',
      'scripts/ledger-compatibility/compare-ledger.js',
      'scripts/ledger-compatibility/ledger-compatibility-matrix.yaml',
      'src/impl/cli/run.js',
      'src/surface/commands/reports/aggregate.js',
      'src/surface/queries/aggregate.js',
      'src/surface/database/schema.sql',
      'src/surface/parser/ledger.ohm',
    ]) {
      assert.ok(packagedPaths.has(requiredPath), `${requiredPath} must be published`);
    }
    for (const packagedPath of packagedPaths) {
      assert.doesNotMatch(
        packagedPath,
        /^(?:\.codex|tests|docs\/improvements\.md|AGENTS\.md|eslint\.config\.js)/u,
      );
    }

    fs.writeFileSync(path.join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'ledlight-package-consumer',
      private: true,
    }));
    const archivePath = path.join(archiveDirectory, packResult.filename);
    runNpm([
      'install',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--prefer-online',
      archivePath,
    ], { cwd: consumerDirectory });

    const projectDirectory = path.join(consumerDirectory, 'project');
    fs.mkdirSync(projectDirectory);
    const journalPath = path.join(projectDirectory, 'journal.ledger');
    fs.writeFileSync(journalPath, `commodity USD
  default
account Assets:Cash
account Equity:Opening

2024-01-01 Opening balance
  Assets:Cash  10 USD
  Equity:Opening
`);

    const consumerEnvironment = {
      ...process.env,
      LEDLIGHT_CACHE_HOME: path.join(consumerDirectory, 'cache'),
      NODE_PATH: '',
    };
    run(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const ledlight = require('ledlight');
      assert.equal(typeof ledlight.openJournal, 'function');
      assert.deepEqual(Object.keys(ledlight), ['openJournal', 'parseLedgerText']);
      assert.equal(ledlight.parseLedgerText('account Assets:Cash').entries[0].name, 'Assets:Cash');
      assert.deepEqual(ledlight.openJournal(${JSON.stringify(journalPath)}).aggregate({}), [
        { account: 'Assets:Cash', quantity: '10', commodity: 'USD' },
        { account: 'Equity:Opening', quantity: '-10', commodity: 'USD' },
      ]);
    `], { cwd: projectDirectory, env: consumerEnvironment });
    run(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import ledlight from 'ledlight';
      assert.equal(typeof ledlight.openJournal, 'function');
    `], { cwd: projectDirectory, env: consumerEnvironment });

    const executableName = process.platform === 'win32' ? 'ledlight.cmd' : 'ledlight';
    const executablePath = path.join(consumerDirectory, 'node_modules', '.bin', executableName);
    const executableCommand = process.platform === 'win32' ? process.env.ComSpec : executablePath;
    const executableArguments = process.platform === 'win32'
      ? ['/d', '/s', '/c', executablePath]
      : [];
    assert.ok(executableCommand, 'The platform must provide an executable command');
    assert.equal(run(executableCommand, [...executableArguments, '--version'], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    }).trim(), packageMetadata.version);
    assert.equal(run(executableCommand, [
      ...executableArguments, 'aggregate', '--file', journalPath, '--format', 'csv',
    ], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    }), 'account,amount,commodity\nAssets:Cash,10,USD\nEquity:Opening,-10,USD\n');

    const comparisonName = process.platform === 'win32' ? 'ledlight-cmp.cmd' : 'ledlight-cmp';
    const comparisonPath = path.join(consumerDirectory, 'node_modules', '.bin', comparisonName);
    const comparisonCommand = process.platform === 'win32' ? process.env.ComSpec : comparisonPath;
    const comparisonArguments = process.platform === 'win32'
      ? ['/d', '/s', '/c', comparisonPath]
      : [];
    assert.ok(comparisonCommand, 'The platform must provide a comparison command');
    assert.match(run(comparisonCommand, [...comparisonArguments, '--list'], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    }), /^\| Case \| Ledlight \| Ledger \|/u);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
