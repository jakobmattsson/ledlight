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

test('the published archive installs and exposes the module and CLI', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-package-'));
  try {
    const archiveDirectory = path.join(temporaryDirectory, 'archive');
    const consumerDirectory = path.join(temporaryDirectory, 'consumer');
    fs.mkdirSync(archiveDirectory);
    fs.mkdirSync(consumerDirectory);

    const packResult = JSON.parse(run('npm', [
      'pack',
      '--json',
      '--pack-destination', archiveDirectory,
    ], { cwd: repositoryRoot }))[0];
    const packagedPaths = new Set(packResult.files.map(({ path: packagedPath }) => packagedPath));
    for (const requiredPath of [
      'LICENSE',
      'README.md',
      'docs/api.md',
      'docs/ledlight.md',
      'docs/package.md',
      'index.js',
      'package.json',
      'src/ledlight/cli/run.js',
    ]) {
      assert.ok(packagedPaths.has(requiredPath), `${requiredPath} must be published`);
    }
    for (const packagedPath of packagedPaths) {
      assert.doesNotMatch(
        packagedPath,
        /^(?:\.codex|tests|docs\/improvements\.md|src\/ledlight\/syntax\/reference|AGENTS\.md|eslint\.config\.js)/u,
      );
    }

    fs.writeFileSync(path.join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'ledlight-package-consumer',
      private: true,
    }));
    const archivePath = path.join(archiveDirectory, packResult.filename);
    run('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--prefer-offline',
      archivePath,
    ], { cwd: consumerDirectory });

    const projectDirectory = path.join(consumerDirectory, 'project');
    fs.mkdirSync(projectDirectory);
    fs.writeFileSync(path.join(projectDirectory, '.ledgerrc'), '--file journal.ledger\n');
    fs.writeFileSync(path.join(projectDirectory, 'journal.ledger'), `commodity USD
  default

2024-01-01 Opening balance
  Assets:Cash  10 USD
  Equity:Opening
`);

    const consumerEnvironment = { ...process.env, NODE_PATH: '' };
    run(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const ledlight = require('ledlight');
      assert.equal(typeof ledlight.openProject, 'function');
      assert.equal(ledlight.version, ${JSON.stringify(packageMetadata.version)});
      assert.doesNotThrow(() => ledlight.parse('account Assets:Cash\\n', { source: '<smoke-test>' }));
      assert.deepEqual(ledlight.aggregateReport({}, process.cwd()), [
        { account: 'Assets:Cash', quantity: '10', commodity: 'USD' },
        { account: 'Equity:Opening', quantity: '-10', commodity: 'USD' },
      ]);
    `], { cwd: projectDirectory, env: consumerEnvironment });
    run(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import ledlight from 'ledlight';
      assert.equal(ledlight.version, ${JSON.stringify(packageMetadata.version)});
    `], { cwd: projectDirectory, env: consumerEnvironment });

    const executableName = process.platform === 'win32' ? 'ledlight.cmd' : 'ledlight';
    const executablePath = path.join(consumerDirectory, 'node_modules', '.bin', executableName);
    assert.equal(run(executablePath, ['--version'], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    }).trim(), packageMetadata.version);
    assert.equal(run(executablePath, ['aggregate', '--csv'], {
      cwd: projectDirectory,
      env: consumerEnvironment,
    }), 'account,amount,commodity\nAssets:Cash,10,USD\nEquity:Opening,-10,USD\n');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
