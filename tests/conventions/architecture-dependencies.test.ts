'use strict';

import type { TestContext } from 'node:test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { instance } = require('@viz-js/viz');
const YAML = require('yaml');
const {
  validateDependsOnYaml, validateUsedByYaml,
} = require('../../src/composition/repository-container');
const { generateGraphDot, loadGraphOptions } = require('../../scripts/architecture/graph');

const modulesRoot = path.resolve(__dirname, '../../src/modules');
const architectureRoot = path.resolve(__dirname, '../../../tests/architecture');
const diagramPath = path.resolve(__dirname, '../../../architecture.svg');

test('dependency policy lists are alphabetical', () => {
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  for (const [section, entries] of Object.entries(policy)) {
    const lists = Array.isArray(entries) ? [[section, entries]] : Object.entries(entries as Record<string, string[]>);
    for (const [name, values] of lists) {
      assert.deepEqual(values, [...values].sort(), `${section}.${name} must be alphabetical`);
    }
  }
});

for (const [fileName, validate] of [
  ['depends-on.yaml', validateDependsOnYaml],
  ['used-by.yaml', validateUsedByYaml],
]) {
  test(`${fileName} matches the current module dependency policy`, () => {
    const actual = fs.readFileSync(path.join(architectureRoot, fileName), 'utf8');
    validate(actual, modulesRoot);
  });
}

test('architecture.svg matches the generated dependency view', async () => {
  const viz = await instance();
  const graphOptions = loadGraphOptions(modulesRoot);
  const yaml = fs.readFileSync(path.join(architectureRoot, 'depends-on.yaml'), 'utf8');
  const actual = fs.readFileSync(diagramPath, 'utf8');
  const expected = viz.renderString(generateGraphDot(YAML.parse(yaml), graphOptions),
    { format: 'svg', engine: 'dot' });
  assert.equal(actual, expected, 'architecture.svg is out of date; run npm run architecture:generate');
});

test('ubiquitous modules retain outgoing arrows and hide incoming ordinary arrows', () => {
  const graphOptions = loadGraphOptions(modulesRoot);
  assert.deepEqual(graphOptions.ubiquitousModules, ['core', 'numeric']);
  assert.deepEqual(graphOptions.ubiquitousExternal, ['fs', 'path', 'zod']);
  const yaml = fs.readFileSync(path.join(architectureRoot, 'depends-on.yaml'), 'utf8');
  const document = YAML.parse(yaml);
  const dot = generateGraphDot(document, graphOptions);
  const coreNode = dot.split('\n').find((line: string) => line.startsWith('  "module:core" [label='));
  assert.ok(coreNode);
  for (const dependency of graphOptions.ubiquitousExternal) {
    assert.ok(coreNode.includes(dependency), dependency);
  }
  for (const dependency of document.core.external) {
    if (graphOptions.ubiquitousExternal.includes(dependency)) continue;
    assert.ok(dot.includes(`"module:core" -> "external:${dependency}"`), dependency);
  }
  assert.doesNotMatch(dot, /"module:[^"]+" -> "module:core"/u);
  const external = new Set((Object.values(document) as Array<{ external: string[] }>).flatMap((entry) => entry.external));
  for (const service of external) {
    const node = `"external:${service}" [label=${JSON.stringify(service)}, shape=ellipse`;
    assert.equal(dot.includes(node), !graphOptions.ubiquitousExternal.includes(service), service);
  }
  assert.doesNotMatch(dot, /UBIQUITOUS MODULES|EXTERNAL SERVICES/u);
  assert.match(dot, /<FONT COLOR="#245B4F" POINT-SIZE="11">core<\/FONT>/u);
  assert.match(dot, /<FONT COLOR="#603E75" POINT-SIZE="11">fs/u);
});

test('ubiquitous modules point to their dependencies, including other ubiquitous modules', () => {
  const document = {
    common: { external: [], modules: [] },
    consumer: { external: [], modules: ['shared'] },
    helper: { external: [], modules: [] },
    shared: { external: ['clock', 'fs'], modules: ['common', 'helper'] },
  };
  const dot = generateGraphDot(document, {
    ubiquitousModules: ['common', 'shared'], ubiquitousExternal: ['fs'],
  });
  const sharedNode = dot.split('\n').find((line: string) => line.startsWith('  "module:shared" [label='));
  const consumerNode = dot.split('\n').find((line: string) => line.startsWith('  "module:consumer" [label='));
  assert.ok(sharedNode?.includes('fs'));
  assert.ok(consumerNode?.includes('shared'));
  assert.match(dot, /"module:shared" -> "module:helper"/u);
  assert.match(dot, /"module:shared" -> "module:common"/u);
  assert.match(dot, /"module:shared" -> "external:clock"/u);
  assert.doesNotMatch(dot, /"module:consumer" -> "module:shared"/u);
  assert.doesNotMatch(dot, /"external:fs" \[label=/u);
});

test('ubiquitous metadata is optional and rejects unknown names', (t: TestContext) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-graph-policy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const policyPath = path.join(directory, 'dependencies.yaml');
  fs.writeFileSync(policyPath, 'allowed-modules:\n  example: []\nallowed-external:\n  example: [clock]\n');
  assert.deepEqual(loadGraphOptions(directory), { ubiquitousModules: [], ubiquitousExternal: [] });
  fs.writeFileSync(policyPath, 'allowed-modules:\n  example: []\nallowed-external:\n  example: [clock]\nubiquitous: [example, clock]\n');
  assert.deepEqual(loadGraphOptions(directory), {
    ubiquitousModules: ['example'], ubiquitousExternal: ['clock'],
  });
  fs.writeFileSync(policyPath, 'allowed-modules:\n  example: []\nallowed-external:\n  example: [clock]\nubiquitous: [missing]\n');
  assert.throws(() => loadGraphOptions(directory), /Unknown ubiquitous dependency: missing/u);
});

test('dependency validators identify changed values, malformed YAML, and stale formatting', () => {
  const dependsOn = fs.readFileSync(path.join(architectureRoot, 'depends-on.yaml'), 'utf8');
  const usedBy = fs.readFileSync(path.join(architectureRoot, 'used-by.yaml'), 'utf8');
  assert.throws(() => validateDependsOnYaml(dependsOn.replace('core:\n  external:\n    - currentWorkingDirectory\n', 'core:\n  external:\n'), modulesRoot),
    /depends-on\.yaml: core\.external\[0\]: expected "currentWorkingDirectory", got "fs"/u);
  assert.throws(() => validateUsedByYaml('external: [\n', modulesRoot),
    /used-by\.yaml: invalid YAML/u);
  assert.throws(() => validateUsedByYaml(usedBy.replace('\n\nmodules:', '\nmodules:'), modulesRoot),
    /used-by\.yaml: formatting differs at line \d+/u);
});
