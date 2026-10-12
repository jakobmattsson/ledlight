'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show accounts',
  examples: [
    'ledlight accounts --file main.ledger',
    'ledlight accounts --file main.ledger --accounts "Assets:*" --usage unused --details',
  ],
  configure(command) {
    options.journal(command);
    options.accounts(command);
    options.usage(command, 'account declarations');
    options.details(command, 'include comments and transaction counts');
    options.format(command);
  },
  prepareOutput(rows, { details }) {
    return details ? rows : rows.map(({ account }) => account);
  },
  formatCsv(rows, { details }, { csvField }) {
    const lines = [details ? 'account,comment,transactionCount' : 'account'];
    for (const row of rows) {
      const values = details
        ? [row.account, row.comment ?? '', row.transactionCount]
        : [row];
      lines.push(values.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows, { details }, { formatTextTable }) {
    if (!details) return rows.length === 0 ? '' : `${rows.join('\n')}\n`;
    return formatTextTable(rows, [
      { heading: 'Transactions', value: (row) => row.transactionCount, align: 'right' },
      { heading: 'Account', value: (row) => row.account },
      { heading: 'Comment', value: (row) => row.comment ?? '' },
    ]);
  },
});
