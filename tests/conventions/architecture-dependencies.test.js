'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  validateDependsOnYaml, validateUsedByYaml,
} = require('../../src/composition/repository-container');

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
