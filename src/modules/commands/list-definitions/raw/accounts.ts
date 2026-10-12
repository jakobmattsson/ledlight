'use strict';

import type { AccountRow } from '../../../../public-api';
import type { Command } from 'commander';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show accounts',
  examples: [
    'ledlight accounts --file main.ledger',
    'ledlight accounts --file main.ledger --accounts "Assets:*" --usage unused --details',
  ],
  configure(command: Command) {
    options.journal(command);
    options.accounts(command);
    options.usage(command, 'account declarations');
    options.details(command, 'include comments and transaction counts');
    options.format(command);
  },
  prepareOutput(rows: AccountRow[], { details }: { details?: boolean }) {
    return details ? rows : rows.map(({ account }) => account);
  },
  formatCsv(rows: AccountRow[] | string[], { details }: { details?: boolean }, { csvField }: { csvField(value: unknown): string }) {
    const lines = [details ? 'account,comment,transactionCount' : 'account'];
    for (const row of rows) {
      const values = details
        ? [(row as AccountRow).account, (row as AccountRow).comment ?? '', (row as AccountRow).transactionCount]
        : [row];
      lines.push(values.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows: AccountRow[] | string[], { details }: { details?: boolean }, { formatTextTable }: { formatTextTable(rows: AccountRow[], columns: Array<{ heading: string; value(row: AccountRow): unknown; align?: string }>): string }) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows as AccountRow[], [
      { heading: 'Transactions', value: (row: AccountRow) => row.transactionCount, align: 'right' },
      { heading: 'Account', value: (row: AccountRow) => row.account },
      { heading: 'Comment', value: (row: AccountRow) => row.comment ?? '' },
    ]);
  },
});
