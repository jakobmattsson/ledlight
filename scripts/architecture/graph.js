'use strict';

function quoted(value) {
  return JSON.stringify(value);
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function graphData(view, document) {
  const modules = view === 'depends-on' ? Object.keys(document) : Object.keys(document.modules);
  const externalByModule = Object.fromEntries(modules.map((name) => [name, []]));
  const edges = [];

  if (view === 'depends-on') {
    for (const [consumer, dependencies] of Object.entries(document)) {
      externalByModule[consumer].push(...dependencies.external);
      for (const dependency of dependencies.modules) {
        edges.push({ from: consumer, to: dependency,
          tooltip: `${consumer} depends on ${dependency}` });
      }
    }
  } else {
    for (const [dependency, consumers] of Object.entries(document.modules)) {
      for (const consumer of consumers) {
        edges.push({ from: dependency, to: consumer,
          tooltip: `${consumer} depends on ${dependency}` });
      }
    }
    for (const [dependency, consumers] of Object.entries(document.external)) {
      for (const consumer of consumers) externalByModule[consumer].push(dependency);
    }
  }

  return { modules: modules.sort(), externalByModule, edges };
}

function moduleLabel(name, external) {
  const names = external.sort().map(escapeHtml);
  const rows = [];
  for (let index = 0; index < names.length; index += 2) {
    rows.push(names.slice(index, index + 2).join(' &#183; '));
  }
  const services = rows.length ? rows.join('<BR/>') : 'None';
  return '<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="9" '
    + 'COLOR="#88A9CF" BGCOLOR="#F8FBFF">'
    + `<TR><TD BGCOLOR="#DCEBFF"><FONT COLOR="#173E6B" POINT-SIZE="16"><B>${escapeHtml(name)}</B></FONT></TD></TR>`
    + '<TR><TD><FONT COLOR="#71548A" POINT-SIZE="9"><B>EXTERNAL SERVICES</B></FONT></TD></TR>'
    + `<TR><TD><FONT COLOR="#4D3C5B" POINT-SIZE="11">${services}</FONT></TD></TR>`
    + '</TABLE>';
}

function generateGraphDot(view, document) {
  if (view !== 'depends-on' && view !== 'used-by') throw new Error(`Unknown graph view: ${view}`);
  const { modules, externalByModule, edges } = graphData(view, document);
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
      + `<FONT POINT-SIZE="12" COLOR="#60738A">${subtitle}</FONT>`
      + '</TD></TR></TABLE>>];',
    '  node [shape=plain, fontname="Helvetica"];',
    '  edge [arrowsize=0.8, penwidth=1.7, color="#6994C6"];',
    ...modules.map((name) => `  ${quoted(name)} [label=<${moduleLabel(name, externalByModule[name])}>, tooltip="Module: ${name}"];`),
    ...edges.map(({ from, to, tooltip }) => `  ${quoted(from)} -> ${quoted(to)} [tooltip=${quoted(tooltip)}];`),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}

module.exports = { generateGraphDot };
