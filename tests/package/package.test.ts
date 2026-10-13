'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const packageMetadata = require('../../../package.json');

function run(command: string, arguments_: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  try {
    return execFileSync(command, arguments_, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: Buffer; stderr?: Buffer };
    throw new Error(failure.stdout?.toString() || failure.stderr?.toString() || failure.message,
      { cause: error });
  }
}

function runNpm(arguments_: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  assert.ok(process.env.npm_execpath, 'npm_execpath must identify the npm CLI');
  return run(process.execPath, [process.env.npm_execpath!, ...arguments_], options);
}

test('the published archive installs and exposes the module and CLI', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-package-'));
  try {
    const archiveDirectory = path.join(temporaryDirectory, 'archive');
    const consumerDirectory = path.join(temporaryDirectory, 'consumer');
    const npmEnvironment = { ...process.env, npm_config_cache: path.join(temporaryDirectory, 'npm-cache') };
    fs.mkdirSync(archiveDirectory);
    fs.mkdirSync(consumerDirectory);

    const packResult = JSON.parse(runNpm([
      'pack',
      '--json',
      '--pack-destination', archiveDirectory,
    ], { cwd: repositoryRoot, env: npmEnvironment }))[0];
    const packagedPaths = new Set<string>(packResult.files.map(({ path: packagedPath }: { path: string }) => packagedPath));
    for (const requiredPath of [
      'LICENSE',
      'README.md',
      'docs/api.md',
      'docs/ledger-cli-equivalence.md',
      'docs/ledlight.md',
      'docs/package.md',
      'dist/src/index.js',
      'dist/src/index.d.ts',
      'dist/src/public-api.d.ts',
      'package.json',
      'dist/scripts/ledger-compatibility/compare-ledger.js',
      'dist/scripts/ledger-compatibility/ledger-compatibility-matrix.yaml',
      'dist/src/run.js',
      'dist/lib/awilix.js',
      'dist/src/modules/dependencies.yaml',
      'dist/src/modules/external.js',
      'dist/src/modules/interfaces/commands.js',
      'dist/src/modules/interfaces/queries.js',
      'dist/src/modules/interfaces/schema.sql',
      'dist/src/modules/interfaces/ledger.ohm',
    ]) {
      assert.ok(packagedPaths.has(requiredPath), `${requiredPath} must be published`);
    }
    for (const packagedPath of packagedPaths) {
      assert.doesNotMatch(
        packagedPath,
        /^(?:\.codex|tests|docs\/improvements\.md|AGENTS\.md|eslint\.config\.js)/u,
      );
      assert.ok(!packagedPath.endsWith('.ts') || packagedPath.endsWith('.d.ts'),
        `${packagedPath} must be built before publication`);
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
    ], { cwd: consumerDirectory, env: npmEnvironment });

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
      const ledlight = require('@jakobm/ledlight');
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
      import ledlight from '@jakobm/ledlight';
      assert.equal(typeof ledlight.openJournal, 'function');
    `], { cwd: projectDirectory, env: consumerEnvironment });

    fs.writeFileSync(path.join(projectDirectory, 'consumer.ts'), `
      import ledlight = require('@jakobm/ledlight');
      const tree = ledlight.parseLedgerText('account Assets:Cash');
      if (tree.entries[0]?.type === 'account') {
        const account: string = tree.entries[0].name;
        void account;
      }
      const journal = ledlight.openJournal('journal.ledger');
      const rows = journal.aggregate({ valuation: 'market', accounts: ['Assets:*'] });
      const quantity: string | undefined = rows[0]?.quantity;
      void quantity;
      // @ts-expect-error Invalid valuation values must be rejected by the declaration.
      journal.aggregate({ valuation: 'invalid' });
      // @ts-expect-error The parser requires source text.
      ledlight.parseLedgerText(123);
    `);
    fs.writeFileSync(path.join(projectDirectory, 'consumer.mts'), `
      import ledlight from '@jakobm/ledlight';
      const tree = ledlight.parseLedgerText('account Assets:Cash');
      const source: string = tree.source;
      void source;
    `);
    fs.writeFileSync(path.join(projectDirectory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'Node16',
        moduleResolution: 'Node16',
        esModuleInterop: true,
      },
      files: ['consumer.ts', 'consumer.mts'],
    }));
    run(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json'], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    });

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
