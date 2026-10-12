'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show commodities',
  examples: [
    'ledlight commodities --file main.ledger',
    'ledlight commodities --file main.ledger --usage all --details',
  ],
  configure(command: any) {
    options.journal(command);
    options.usage(command, 'commodity declarations');
    options.details(command, 'include comments, formats, and usage');
    options.format(command);
  },
  prepareOutput(rows: any, { details }: any) {
    return details ? rows : rows.map(({ commodity }: any) => commodity);
  },
  formatCsv(rows: any, { details }: any, { csvField }: any) {
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
  formatText(rows: any, { details }: any, { formatTextTable }: any) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows, [
      { heading: 'Commodity', value: (row: any) => row.commodity },
      { heading: 'Default', value: (row: any) => row.isDefault ? 'yes' : '' },
      { heading: 'Used', value: (row: any) => row.used ? 'yes' : '' },
      { heading: 'Format', value: (row: any) => row.format ?? '' },
      { heading: 'Comment', value: (row: any) => row.comment ?? '' },
    ]);
  },
});
