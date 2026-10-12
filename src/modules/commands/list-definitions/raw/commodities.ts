'use strict';

import type { CommodityRow } from '../../../../public-api';
import type { Command } from 'commander';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show commodities',
  examples: [
    'ledlight commodities --file main.ledger',
    'ledlight commodities --file main.ledger --usage all --details',
  ],
  configure(command: Command) {
    options.journal(command);
    options.usage(command, 'commodity declarations');
    options.details(command, 'include comments, formats, and usage');
    options.format(command);
  },
  prepareOutput(rows: CommodityRow[], { details }: { details?: boolean }) {
    return details ? rows : rows.map(({ commodity }) => commodity);
  },
  formatCsv(rows: CommodityRow[] | string[], { details }: { details?: boolean }, { csvField }: { csvField(value: unknown): string }) {
    if (!details) return `${['commodity', ...rows.map(csvField)].join('\n')}\n`;
    const lines = ['commodity,comment,format,isDefault,used'];
    for (const row of rows) {
      lines.push([
        (row as CommodityRow).commodity,
        (row as CommodityRow).comment ?? '',
        (row as CommodityRow).format ?? '',
        (row as CommodityRow).isDefault,
        (row as CommodityRow).used,
      ].map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows: CommodityRow[] | string[], { details }: { details?: boolean }, { formatTextTable }: { formatTextTable(rows: CommodityRow[], columns: Array<{ heading: string; value(row: CommodityRow): unknown; align?: string }>): string }) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows as CommodityRow[], [
      { heading: 'Commodity', value: (row: CommodityRow) => (row as CommodityRow).commodity },
      { heading: 'Default', value: (row: CommodityRow) => (row as CommodityRow).isDefault ? 'yes' : '' },
      { heading: 'Used', value: (row: CommodityRow) => (row as CommodityRow).used ? 'yes' : '' },
      { heading: 'Format', value: (row: CommodityRow) => (row as CommodityRow).format ?? '' },
      { heading: 'Comment', value: (row: CommodityRow) => (row as CommodityRow).comment ?? '' },
    ]);
  },
});
