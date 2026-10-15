'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { instance } = require('@viz-js/viz');
const {
  generateDependsOnYaml, generateUsedByYaml,
} = require('./repository-container');
const { generateGraphDot, loadGraphOptions } = require('./architecture-graph');

type ArchitecturePaths = {
  modulesRoot: string;
  dependsOnPath: string;
  usedByPath: string;
  diagramPath: string;
};

async function generateArchitecture({ modulesRoot, dependsOnPath, usedByPath,
  diagramPath }: ArchitecturePaths): Promise<void> {
  const dependsOnYaml = generateDependsOnYaml(modulesRoot);
  const usedByYaml = generateUsedByYaml(modulesRoot);
  const graphOptions = loadGraphOptions(modulesRoot);
  const viz = await instance();
  const dot = generateGraphDot(YAML.parse(dependsOnYaml), graphOptions);
  const svg = viz.renderString(dot, { format: 'svg', engine: 'dot' });

  for (const [fileName, content] of [
    [dependsOnPath, dependsOnYaml],
    [usedByPath, usedByYaml],
    [diagramPath, svg],
  ]) {
    fs.mkdirSync(path.dirname(fileName), { recursive: true });
    fs.writeFileSync(fileName, content);
  }
}

module.exports = { generateArchitecture };
