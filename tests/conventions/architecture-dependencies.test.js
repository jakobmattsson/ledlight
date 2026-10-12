'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');
const {
  generateDependsOnYaml, generateUsedByYaml,
} = require('../../src/composition/repository-container');

const modulesRoot = path.resolve(__dirname, '../../src/modules');
const architectureRoot = path.resolve(__dirname, '../architecture');

for (const [fileName, generate] of [
  ['depends-on.yaml', generateDependsOnYaml],
  ['used-by.yaml', generateUsedByYaml],
]) {
  test(`${fileName} matches the current module dependency policy`, () => {
    const actual = fs.readFileSync(path.join(architectureRoot, fileName), 'utf8');
    assert.equal(actual, generate(modulesRoot), 'Run npm run architecture:generate to update the snapshot');
    const lists = fileName === 'depends-on.yaml'
      ? Object.values(YAML.parse(actual)).flatMap(({ external, modules }) => [external, modules])
      : Object.values(YAML.parse(actual)).flatMap((dependencies) => Object.values(dependencies));
    for (const list of lists) assert.deepEqual(list, [...list].sort());
  });
}
