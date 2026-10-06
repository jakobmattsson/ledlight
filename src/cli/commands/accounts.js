'use strict';

const options = require('./options');

module.exports = {
  name: 'accounts', operation: 'accounts', group: 'raw', description: 'show accounts',
  configure(command) {
    options.journal(command);
    options.accounts(command);
    options.usage(command, 'account declarations');
    options.details(command, 'include comments and transaction counts');
    options.format(command);
  },
  parse({ accounts, usage, details, format }) {
    return {
      options: { accounts: accounts || [], usage },
      output: { details: details || false, format },
    };
  },
  run({ options: input, output }, journal, format) {
    return format.formatAccounts(journal.accounts(input), output);
  },
  formatters(shared) {
    const { csvField, formatJson, formatTextTable } = shared;

    function formatAccounts(rows, { details, format }) {
      const accountNames = rows.map(({ account }) => account);
      const selectedRows = details ? rows : accountNames;
      if (format === 'json') return formatJson(selectedRows);
      if (format === 'csv') {
        const lines = [details ? 'account,comment,transactionCount' : 'account'];
        for (const row of rows) {
          const values = details
            ? [row.account, row.comment ?? '', row.transactionCount]
            : [row.account];
          lines.push(values.map(csvField).join(','));
        }
        return `${lines.join('\n')}\n`;
      }
      if (!details) return accountNames.length === 0 ? '' : `${accountNames.join('\n')}\n`;
      return formatTextTable(rows, [
        { heading: 'Transactions', value: (row) => row.transactionCount, align: 'right' },
        { heading: 'Account', value: (row) => row.account },
        { heading: 'Comment', value: (row) => row.comment ?? '' },
      ]);
    }

    return { formatAccounts };
  },
};
