'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

function quoted(value) {
  return JSON.stringify(value);
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function loadGraphOptions(modulesRoot) {
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  const knownModules = new Set(Object.keys(policy['allowed-modules']));
  const knownExternal = new Set(Object.values(policy['allowed-external']).flat());
  const names = policy.ubiquitous ?? [];
  if (!Array.isArray(names)) throw new TypeError('ubiquitous must be a list');
  const seen = new Set();
  for (const name of names) {
    if (!knownModules.has(name) && !knownExternal.has(name)) {
      throw new Error(`Unknown ubiquitous dependency: ${name}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate ubiquitous dependency: ${name}`);
    seen.add(name);
  }
  return {
    ubiquitousModules: names.filter((name) => knownModules.has(name)),
    ubiquitousExternal: names.filter((name) => knownExternal.has(name)),
  };
}

function nodeId(kind, name) {
  return quoted(`${kind}:${name}`);
}

function graphData(document, { ubiquitousModules, ubiquitousExternal }) {
  const hiddenModules = new Set(ubiquitousModules);
  const hiddenExternal = new Set(ubiquitousExternal);
  const modules = Object.keys(document).filter((name) => !hiddenModules.has(name));
  const allExternal = [...new Set(Object.values(document).flatMap((entry) => entry.external))];
  const external = allExternal.filter((name) => !hiddenExternal.has(name)).sort();
  const externalByModule = Object.fromEntries(modules.map((name) => [name, []]));
  const ubiquitousByModule = Object.fromEntries(modules.map((name) => [name, []]));
  const edges = [];

  for (const [consumer, dependencies] of Object.entries(document)) {
    if (hiddenModules.has(consumer)) continue;
    for (const dependency of dependencies.external) {
      if (hiddenExternal.has(dependency)) externalByModule[consumer].push(dependency);
      else {
        edges.push({ from: nodeId('module', consumer), to: nodeId('external', dependency),
          kind: 'external', tooltip: `${consumer} uses ${dependency}` });
      }
    }
    for (const dependency of dependencies.modules) {
      if (hiddenModules.has(dependency)) ubiquitousByModule[consumer].push(dependency);
      else {
        edges.push({ from: nodeId('module', consumer), to: nodeId('module', dependency),
          kind: 'module', tooltip: `${consumer} depends on ${dependency}` });
      }
    }
  }

  return { modules: modules.sort(), external, externalByModule, ubiquitousByModule, edges };
}

function moduleLabel(name, external, ubiquitous) {
  const names = external.sort().map(escapeHtml);
  const rows = [];
  for (let index = 0; index < names.length; index += 2) {
    rows.push(names.slice(index, index + 2).join(' &#183; '));
  }
  return '<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="9" '
    + 'COLOR="#88A9CF" BGCOLOR="#F8FBFF">'
    + `<TR><TD BGCOLOR="#DCEBFF"><FONT COLOR="#173E6B" POINT-SIZE="16"><B>${escapeHtml(name)}</B></FONT></TD></TR>`
    + (ubiquitous.length ? '<TR><TD BGCOLOR="#EEF7F4">'
      + `<FONT COLOR="#245B4F" POINT-SIZE="11">${ubiquitous.sort().map(escapeHtml).join(' &#183; ')}</FONT>`
      + '</TD></TR>' : '')
    + (rows.length ? '<TR><TD BGCOLOR="#F5EFFA">'
      + `<FONT COLOR="#603E75" POINT-SIZE="11">${rows.join('<BR/>')}</FONT>`
      + '</TD></TR>' : '')
    + '</TABLE>';
}

function generateGraphDot(document, options) {
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
      externalByModule[name], ubiquitousByModule[name])}>, tooltip="Module: ${name}"];`),
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
