'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

type GraphOptions = { ubiquitousModules: string[]; ubiquitousExternal: string[] };
type DependencyEntry = { external: string[]; modules: string[] };
type DependencyDocument = Record<string, DependencyEntry>;
type GraphEdge = { from: string; to: string; kind: 'module' | 'external'; tooltip: string };

function quoted(value: string): string {
  return JSON.stringify(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function loadGraphOptions(modulesRoot: string): GraphOptions {
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  const knownModules = new Set(Object.keys(policy['allowed-modules']));
  const knownExternal = new Set(Object.values(policy['allowed-external']).flat());
  const names = policy.ubiquitous ?? [];
  if (!Array.isArray(names)) throw new TypeError('ubiquitous must be a list');
  const seen = new Set<string>();
  for (const name of names) {
    if (!knownModules.has(name) && !knownExternal.has(name)) {
      throw new Error(`Unknown ubiquitous dependency: ${name}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate ubiquitous dependency: ${name}`);
    seen.add(name);
  }
  return {
    ubiquitousModules: names.filter((name: string) => knownModules.has(name)),
    ubiquitousExternal: names.filter((name: string) => knownExternal.has(name)),
  };
}

function nodeId(kind: string, name: string): string {
  return quoted(`${kind}:${name}`);
}

function graphData(document: DependencyDocument, { ubiquitousModules, ubiquitousExternal }: GraphOptions) {
  const ubiquitousModuleNames = new Set(ubiquitousModules);
  const hiddenExternal = new Set(ubiquitousExternal);
  const modules = Object.keys(document);
  const allExternal = [...new Set(Object.values(document).flatMap((entry) => entry.external))];
  const external = allExternal.filter((name) => !hiddenExternal.has(name)).sort();
  const externalByModule: Record<string, string[]> = Object.fromEntries(modules.map((name) => [name, []]));
  const ubiquitousByModule: Record<string, string[]> = Object.fromEntries(modules.map((name) => [name, []]));
  const edges: GraphEdge[] = [];

  for (const [consumer, dependencies] of Object.entries(document)) {
    for (const dependency of dependencies.external) {
      if (hiddenExternal.has(dependency)) externalByModule[consumer].push(dependency);
      else {
        edges.push({ from: nodeId('module', consumer), to: nodeId('external', dependency),
          kind: 'external', tooltip: `${consumer} uses ${dependency}` });
      }
    }
    for (const dependency of dependencies.modules) {
      if (ubiquitousModuleNames.has(dependency) && !ubiquitousModuleNames.has(consumer)) {
        ubiquitousByModule[consumer].push(dependency);
      }
      else {
        edges.push({ from: nodeId('module', consumer), to: nodeId('module', dependency),
          kind: 'module', tooltip: `${consumer} depends on ${dependency}` });
      }
    }
  }

  return { modules: modules.sort(), external, externalByModule, ubiquitousByModule, edges };
}

function moduleLabel(name: string, external: string[], moduleDependencies: string[], standalone: boolean): string {
  const names = external.sort().map(escapeHtml);
  const rows: string[] = [];
  for (let index = 0; index < names.length; index += 2) {
    rows.push(names.slice(index, index + 2).join(' &#183; '));
  }
  return '<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="9" '
    + `COLOR="${standalone ? '#77B3A4' : '#88A9CF'}" BGCOLOR="#F8FBFF">`
    + `<TR><TD BGCOLOR="${standalone ? '#DDEFE9' : '#DCEBFF'}">`
    + `<FONT COLOR="${standalone ? '#245B4F' : '#173E6B'}" POINT-SIZE="16">`
    + `<B>${escapeHtml(name)}</B></FONT></TD></TR>`
    + (moduleDependencies.length ? '<TR><TD BGCOLOR="#EEF7F4">'
      + '<FONT COLOR="#245B4F" POINT-SIZE="11">'
      + `${moduleDependencies.sort().map(escapeHtml).join(' &#183; ')}</FONT>`
      + '</TD></TR>' : '')
    + (rows.length ? '<TR><TD BGCOLOR="#F5EFFA">'
      + `<FONT COLOR="#603E75" POINT-SIZE="11">${rows.join('<BR/>')}</FONT>`
      + '</TD></TR>' : '')
    + '</TABLE>';
}

function generateGraphDot(document: DependencyDocument, options: GraphOptions): string {
  const { modules, external, externalByModule, ubiquitousByModule, edges } =
    graphData(document, options);
  const lines = [
    'digraph architecture {',
    `  graph [rankdir=LR, bgcolor="#FFFFFF", pad="0.50", nodesep="0.62", ranksep="1.0", `
      + `splines=true, outputorder=edgesfirst, fontname="Helvetica", labelloc=t, `
      + 'label=<<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="6" BGCOLOR="#FFFFFF"><TR><TD>'
      + '<FONT POINT-SIZE="24" COLOR="#213047"><B>ARCHITECTURE</B></FONT><BR/>'
      + '<FONT POINT-SIZE="12" COLOR="#60738A">Arrows point to required dependencies</FONT><BR/>'
      + '<FONT POINT-SIZE="10" COLOR="#245B4F">Green: ubiquitous modules</FONT>'
      + '<FONT POINT-SIZE="10" COLOR="#60738A"> &#183; </FONT>'
      + '<FONT POINT-SIZE="10" COLOR="#603E75">Purple: external services</FONT>'
      + '</TD></TR></TABLE>>];',
    '  node [shape=plain, fontname="Helvetica"];',
    '  edge [arrowsize=0.8, penwidth=1.7, color="#6994C6"];',
    ...modules.map((name) => `  ${nodeId('module', name)} [label=<${moduleLabel(name,
      externalByModule[name], ubiquitousByModule[name],
      options.ubiquitousModules.includes(name))}>, tooltip="Module: ${name}"];`),
    ...external.map((name) => `  ${nodeId('external', name)} [label=${quoted(name)}, `
      + 'shape=ellipse, style=filled, color="#AA86BF", fillcolor="#F5EFFA", '
      + 'fontcolor="#603E75", fontsize=12, margin="0.17,0.10", tooltip="External service"];'),
    ...edges.map(({ from, to, kind, tooltip }) => `  ${from} -> ${to} [`
      + `color="${kind === 'module' ? '#6994C6' : '#AC8DBD'}", `
      + `style=${kind === 'module' ? 'solid' : 'dashed'}, tooltip=${quoted(tooltip)}];`),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = { generateGraphDot, loadGraphOptions };
