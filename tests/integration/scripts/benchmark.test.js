'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('benchmark command loads its synthetic journal and writes action results', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-benchmark-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'results.json');
  const repositoryRoot = path.resolve(__dirname, '../../..');

  execFileSync(process.execPath, [path.join(repositoryRoot, 'scripts/benchmarks/run.js'), outputPath], {
    cwd: repositoryRoot,
    stdio: 'pipe',
  });

  const results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(results.map(({ name, unit }) => ({ name, unit })), [
    { name: 'Cold journal load', unit: 'ms' },
    { name: 'Cached journal load', unit: 'ms' },
    { name: 'Aggregate report', unit: 'ms' },
  ]);
  assert.ok(results.every(({ value }) => Number.isFinite(value) && value >= 0));
});
