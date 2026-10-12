'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show accounts',
  examples: [
    'ledlight accounts --file main.ledger',
    'ledlight accounts --file main.ledger --accounts "Assets:*" --usage unused --details',
  ],
  configure(command: any) {
    options.journal(command);
    options.accounts(command);
    options.usage(command, 'account declarations');
    options.details(command, 'include comments and transaction counts');
    options.format(command);
  },
  prepareOutput(rows: any, { details }: any) {
    return details ? rows : rows.map(({ account }: any) => account);
  },
  formatCsv(rows: any, { details }: any, { csvField }: any) {
    const lines = [details ? 'account,comment,transactionCount' : 'account'];
    for (const row of rows) {
      const values = details
        ? [row.account, row.comment ?? '', row.transactionCount]
        : [row];
      lines.push(values.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows: any, { details }: any, { formatTextTable }: any) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows, [
      { heading: 'Transactions', value: (row: any) => row.transactionCount, align: 'right' },
      { heading: 'Account', value: (row: any) => row.account },
      { heading: 'Comment', value: (row: any) => row.comment ?? '' },
    ]);
  },
});
