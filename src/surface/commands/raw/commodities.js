'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show commodities',
  configure(command) {
    options.journal(command);
    options.usage(command, 'commodities declarations');
    options.details(command, 'include comments, formats, and usage');
    options.format(command);
  },
  prepareOutput(rows, { details }) {
    return details ? rows : rows.map(({ commodity }) => commodity);
  },
  formatCsv(rows, { details }, { csvField }) {
    if (!details) return `${['commodity', ...rows.map(csvField)].join('\n')}\n`;
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
  },
  formatText(rows, { details }, { formatTextTable }) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows, [
      { heading: 'Commodity', value: (row) => row.commodity },
      { heading: 'Default', value: (row) => row.isDefault ? 'yes' : '' },
      { heading: 'Used', value: (row) => row.used ? 'yes' : '' },
      { heading: 'Format', value: (row) => row.format ?? '' },
      { heading: 'Comment', value: (row) => row.comment ?? '' },
    ]);
  },
});
