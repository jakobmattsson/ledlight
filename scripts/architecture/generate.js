'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { instance } = require('@viz-js/viz');
const {
  generateDependsOnYaml, generateUsedByYaml,
} = require('../../src/composition/repository-container');
const { generateGraphDot } = require('./graph');

const repositoryRoot = path.resolve(__dirname, '../..');
const modulesRoot = path.join(repositoryRoot, 'src/modules');
const outputRoot = path.join(repositoryRoot, 'tests/architecture');

async function generate() {
  const dependsOnYaml = generateDependsOnYaml(modulesRoot);
  const usedByYaml = generateUsedByYaml(modulesRoot);
  const viz = await instance();
  const views = [
    ['depends-on', dependsOnYaml],
    ['used-by', usedByYaml],
  ];

  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [name, yaml] of views) {
    const dot = generateGraphDot(name, YAML.parse(yaml));
    const svg = viz.renderString(dot, { format: 'svg', engine: 'dot' });
    fs.writeFileSync(path.join(outputRoot, `${name}.yaml`), yaml);
    fs.writeFileSync(path.join(outputRoot, `${name}.svg`), svg);
  }
}

generate().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
