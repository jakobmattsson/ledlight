'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const { generateArchitecture } = require('@jakobm/portico');

const modulesRoot = path.resolve(__dirname, '../../src/modules');
const architectureRoot = path.resolve(__dirname, '../../../architecture');

test('dependency policy lists are alphabetical', () => {
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  for (const [section, entries] of Object.entries(policy)) {
    const lists = Array.isArray(entries) ? [[section, entries]] : Object.entries(entries as Record<string, string[]>);
    for (const [name, values] of lists) {
      assert.deepEqual(values, [...values].sort(), `${section}.${name} must be alphabetical`);
    }
  }
});

test('committed architecture views match the dependency policy', async (context: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-architecture-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await generateArchitecture({ modulesRoot, outputDirectory: directory });

  for (const name of ['depends-on.yaml', 'used-by.yaml', 'architecture.svg']) {
    const generated = path.join(directory, name);
    const committed = path.join(architectureRoot, name);
    assert.equal(fs.readFileSync(committed, 'utf8'), fs.readFileSync(generated, 'utf8'),
      `${path.basename(committed)} is out of date; run npm run architecture:generate`);
  }
});
