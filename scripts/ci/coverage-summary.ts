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
  .filter(([name]: any) => name !== 'total')
  .map(([name, coverage]: any) => [path.relative(process.cwd(), name), coverage])
  .sort(([left]: any, [right]: any) => left.localeCompare(right));

if (!report.total || files.length === 0) {
  throw new Error('The coverage report has no file results.');
}

function percentage(coverage: any, metric: any) {
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
  lines.push(`| ${label} | ${metrics.map((metric: any) => percentage(coverage, metric)).join(' | ')} |`);
}

lines.push('', 'Download the `coverage-report` artifact and open `index.html` to inspect covered and uncovered source lines.', '');
fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
