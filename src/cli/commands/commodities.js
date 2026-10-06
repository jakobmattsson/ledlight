'use strict';

const options = require('./options');

module.exports = {
  name: 'commodities', operation: 'commodities', group: 'raw',
  description: 'show commodities',
  configure(command) {
    options.journal(command);
    options.usage(command, 'commodities declarations');
    options.details(command, 'include comments, formats, and usage');
    options.format(command);
  },
  parse({ usage, details, format }) {
    return { options: { usage }, output: { details: details || false, format } };
  },
  run({ options: input, output }, journal, format) {
    return format.formatCommodities(journal.commodities(input), output);
  },
  formatters(shared) {
    const { csvField, formatJson, formatNameRows, formatTextTable } = shared;

    function formatCommodities(rows, { details, format }) {
      if (!details) return formatNameRows(rows, { format }, 'commodity');
      if (format === 'json') return formatJson(rows);
      if (format === 'csv') {
        const lines = ['commodity,comment,format,isDefault,used'];
        for (const row of rows) {
          lines.push([
            row.commodity,
            row.comment ?? '',
            row.format ?? '',
            row.isDefault,
            row.used,
          ].map(csvField).join(','));
        }
        return `${lines.join('\n')}\n`;
      }
      return formatTextTable(rows, [
        { heading: 'Commodity', value: (row) => row.commodity },
        { heading: 'Default', value: (row) => row.isDefault ? 'yes' : '' },
        { heading: 'Used', value: (row) => row.used ? 'yes' : '' },
        { heading: 'Format', value: (row) => row.format ?? '' },
        { heading: 'Comment', value: (row) => row.comment ?? '' },
      ]);
    }

    return { formatCommodities };
  },
};
