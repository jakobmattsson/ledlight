'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { instance } = require('@viz-js/viz');
const {
  generateDependsOnYaml, generateUsedByYaml,
} = require('../../src/composition/repository-container');
const { generateGraphDot, loadGraphOptions } = require('./graph');

const repositoryRoot = path.resolve(__dirname, '../..');
const modulesRoot = path.join(repositoryRoot, 'src/modules');
const outputRoot = path.join(repositoryRoot, 'tests/architecture');

async function generate() {
  const dependsOnYaml = generateDependsOnYaml(modulesRoot);
  const usedByYaml = generateUsedByYaml(modulesRoot);
  const graphOptions = loadGraphOptions(modulesRoot);
  const viz = await instance();
  const dot = generateGraphDot(YAML.parse(dependsOnYaml), graphOptions);
  const svg = viz.renderString(dot, { format: 'svg', engine: 'dot' });

  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'depends-on.yaml'), dependsOnYaml);
  fs.writeFileSync(path.join(outputRoot, 'used-by.yaml'), usedByYaml);
  fs.writeFileSync(path.join(repositoryRoot, 'architecture.svg'), svg);
}

generate().catch((error: any) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
