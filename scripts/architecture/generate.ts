'use strict';

const path = require('node:path');
const { generateArchitecture } = require('@jakobm/portico');

const repositoryRoot = path.resolve(__dirname, '../../..');
const modulesRoot = path.join(repositoryRoot, 'dist/src/modules');
const outputRoot = path.join(repositoryRoot, 'tests/architecture');

generateArchitecture({
  modulesRoot,
  dependsOnPath: path.join(outputRoot, 'depends-on.yaml'),
  usedByPath: path.join(outputRoot, 'used-by.yaml'),
  diagramPath: path.join(repositoryRoot, 'architecture.svg'),
}).catch((error: any) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
