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

function loadUbiquitousModules(modulesRoot) {
  const policy = YAML.parse(fs.readFileSync(path.join(modulesRoot, 'dependencies.yaml'), 'utf8'));
  const names = policy['ubiquitous-modules'] ?? [];
  if (!Array.isArray(names)) throw new TypeError('ubiquitous-modules must be a list');
  const known = new Set(Object.keys(policy.allowedModules));
  const seen = new Set();
  for (const name of names) {
    if (!known.has(name)) throw new Error(`Unknown ubiquitous module: ${name}`);
    if (seen.has(name)) throw new Error(`Duplicate ubiquitous module: ${name}`);
    seen.add(name);
  }
  return names;
}

function graphData(view, document, ubiquitousModules) {
  const ubiquitous = new Set(ubiquitousModules);
  const allModules = view === 'depends-on' ? Object.keys(document) : Object.keys(document.modules);
  const modules = allModules.filter((name) => !ubiquitous.has(name));
  const externalByModule = Object.fromEntries(modules.map((name) => [name, []]));
  const ubiquitousByModule = Object.fromEntries(modules.map((name) => [name, []]));
  const edges = [];

  if (view === 'depends-on') {
    for (const [consumer, dependencies] of Object.entries(document)) {
      if (ubiquitous.has(consumer)) continue;
      externalByModule[consumer].push(...dependencies.external);
      for (const dependency of dependencies.modules) {
        if (ubiquitous.has(dependency)) ubiquitousByModule[consumer].push(dependency);
        else {
          edges.push({ from: consumer, to: dependency,
            tooltip: `${consumer} depends on ${dependency}` });
        }
      }
    }
  } else {
    for (const [dependency, consumers] of Object.entries(document.modules)) {
      for (const consumer of consumers) {
        if (ubiquitous.has(consumer)) continue;
        if (ubiquitous.has(dependency)) ubiquitousByModule[consumer].push(dependency);
        else {
          edges.push({ from: dependency, to: consumer,
            tooltip: `${consumer} depends on ${dependency}` });
        }
      }
    }
    for (const [dependency, consumers] of Object.entries(document.external)) {
      for (const consumer of consumers) {
        if (!ubiquitous.has(consumer)) externalByModule[consumer].push(dependency);
      }
    }
  }

  return { modules: modules.sort(), externalByModule, ubiquitousByModule, edges };
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

function generateGraphDot(view, document, ubiquitousModules) {
  if (view !== 'depends-on' && view !== 'used-by') throw new Error(`Unknown graph view: ${view}`);
  const { modules, externalByModule, ubiquitousByModule, edges } =
    graphData(view, document, ubiquitousModules);
  const title = view === 'depends-on' ? 'DEPENDS ON' : 'USED BY';
  const subtitle = view === 'depends-on'
    ? 'Arrows point to required modules'
    : 'Arrows point to modules that use a dependency';
  const lines = [
    'digraph architecture {',
    `  graph [rankdir=LR, bgcolor="#FFFFFF", pad="0.50", nodesep="0.62", ranksep="1.0", `
      + `splines=true, outputorder=edgesfirst, fontname="Helvetica", labelloc=t, `
      + 'label=<<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="6" BGCOLOR="#FFFFFF"><TR><TD>'
      + `<FONT POINT-SIZE="24" COLOR="#213047"><B>${title}</B></FONT><BR/>`
      + `<FONT POINT-SIZE="12" COLOR="#60738A">${subtitle}</FONT><BR/>`
      + '<FONT POINT-SIZE="10" COLOR="#245B4F">Green: ubiquitous modules</FONT>'
      + '<FONT POINT-SIZE="10" COLOR="#60738A"> &#183; </FONT>'
      + '<FONT POINT-SIZE="10" COLOR="#603E75">Purple: external services</FONT>'
      + '</TD></TR></TABLE>>];',
    '  node [shape=plain, fontname="Helvetica"];',
    '  edge [arrowsize=0.8, penwidth=1.7, color="#6994C6"];',
    ...modules.map((name) => `  ${quoted(name)} [label=<${moduleLabel(name,
      externalByModule[name], ubiquitousByModule[name])}>, tooltip="Module: ${name}"];`),
    ...edges.map(({ from, to, tooltip }) => `  ${quoted(from)} -> ${quoted(to)} [tooltip=${quoted(tooltip)}];`),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = { generateGraphDot, loadUbiquitousModules };
