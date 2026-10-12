'use strict';

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
const { generateGraphDot, loadUbiquitousModules } = require('../../scripts/architecture/graph');

const modulesRoot = path.resolve(__dirname, '../../src/modules');
const architectureRoot = path.resolve(__dirname, '../architecture');

for (const [fileName, validate] of [
  ['depends-on.yaml', validateDependsOnYaml],
  ['used-by.yaml', validateUsedByYaml],
]) {
  test(`${fileName} matches the current module dependency policy`, () => {
    const actual = fs.readFileSync(path.join(architectureRoot, fileName), 'utf8');
    validate(actual, modulesRoot);
  });
}

test('architecture diagrams match the generated dependency views', async () => {
  const viz = await instance();
  const ubiquitousModules = loadUbiquitousModules(modulesRoot);
  for (const name of ['depends-on', 'used-by']) {
    const yaml = fs.readFileSync(path.join(architectureRoot, `${name}.yaml`), 'utf8');
    const actual = fs.readFileSync(path.join(architectureRoot, `${name}.svg`), 'utf8');
    const expected = viz.renderString(generateGraphDot(name, YAML.parse(yaml), ubiquitousModules),
      { format: 'svg', engine: 'dot' });
    assert.equal(actual, expected, `${name}.svg is out of date; run npm run architecture:generate`);
  }
});

test('ubiquitous modules remain in YAML but appear inside consuming graph nodes', () => {
  const ubiquitousModules = loadUbiquitousModules(modulesRoot);
  assert.deepEqual(ubiquitousModules, ['core']);
  for (const name of ['depends-on', 'used-by']) {
    const yaml = fs.readFileSync(path.join(architectureRoot, `${name}.yaml`), 'utf8');
    const document = YAML.parse(yaml);
    const dot = generateGraphDot(name, document, ubiquitousModules);
    assert.doesNotMatch(dot, / {2}"core" \[label=/u);
    assert.doesNotMatch(dot, /"core" ->|-> "core"/u);
    assert.doesNotMatch(dot, /UBIQUITOUS MODULES|EXTERNAL SERVICES/u);
    assert.match(dot, /<FONT COLOR="#245B4F" POINT-SIZE="11">core<\/FONT>/u);
  }
});

test('ubiquitous module metadata is optional and rejects unknown names', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledlight-graph-policy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const policyPath = path.join(directory, 'dependencies.yaml');
  fs.writeFileSync(policyPath, 'allowedModules:\n  example: []\n');
  assert.deepEqual(loadUbiquitousModules(directory), []);
  fs.writeFileSync(policyPath, 'allowedModules:\n  example: []\nubiquitous-modules: [missing]\n');
  assert.throws(() => loadUbiquitousModules(directory), /Unknown ubiquitous module: missing/u);
});

test('dependency validators identify changed values, malformed YAML, and stale formatting', () => {
  const dependsOn = fs.readFileSync(path.join(architectureRoot, 'depends-on.yaml'), 'utf8');
  const usedBy = fs.readFileSync(path.join(architectureRoot, 'used-by.yaml'), 'utf8');
  assert.throws(() => validateDependsOnYaml(dependsOn.replace('    - crypto\n', ''), modulesRoot),
    /depends-on\.yaml: core\.external\[0\]: expected "crypto", got "currentWorkingDirectory"/u);
  assert.throws(() => validateUsedByYaml('external: [\n', modulesRoot),
    /used-by\.yaml: invalid YAML/u);
  assert.throws(() => validateUsedByYaml(usedBy.replace('\n\nmodules:', '\nmodules:'), modulesRoot),
    /used-by\.yaml: formatting differs at line \d+/u);
});
