'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  generateDependsOnYaml, generateUsedByYaml,
} = require('../../src/composition/repository-container');

const repositoryRoot = path.resolve(__dirname, '../..');
const modulesRoot = path.join(repositoryRoot, 'src/modules');
const outputRoot = path.join(repositoryRoot, 'tests/architecture');

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'depends-on.yaml'), generateDependsOnYaml(modulesRoot));
fs.writeFileSync(path.join(outputRoot, 'used-by.yaml'), generateUsedByYaml(modulesRoot));
