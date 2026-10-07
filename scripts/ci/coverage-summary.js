#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reportPath = path.resolve('coverage/coverage-summary.json');
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (!summaryPath) {
  throw new Error('GITHUB_STEP_SUMMARY must point to a GitHub Actions job summary file.');
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const metrics = ['statements', 'branches', 'functions', 'lines'];
const files = Object.entries(report)
  .filter(([name]) => name !== 'total')
  .map(([name, coverage]) => [path.relative(process.cwd(), name), coverage])
  .sort(([left], [right]) => left.localeCompare(right));

if (!report.total || files.length === 0) {
  throw new Error('The coverage report has no file results.');
}

function percentage(coverage, metric) {
  return `${coverage[metric].pct.toFixed(2)}%`;
}

const lines = [
  '## Code coverage',
  '',
  '| File | Statements | Branches | Functions | Lines |',
  '| --- | ---: | ---: | ---: | ---: |',
];

for (const [name, coverage] of [['**Total**', report.total], ...files]) {
  const label = name === '**Total**' ? name : `\`${name.replaceAll('|', '\\|')}\``;
  lines.push(`| ${label} | ${metrics.map((metric) => percentage(coverage, metric)).join(' | ')} |`);
}

lines.push('', 'Download the `coverage-lcov` artifact for line-level coverage data.', '');
fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
