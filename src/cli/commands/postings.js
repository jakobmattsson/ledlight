'use strict';

const options = require('./options');

module.exports = {
  name: 'postings', operation: 'postings', group: 'raw', description: 'show postings',
  configure(command) {
    options.journal(command);
    options.date(command, '--from <date>', 'include postings on or after YYYY-MM-DD', 'from');
    options.date(command, '--to <date>', 'include postings on or before YYYY-MM-DD', 'to');
    options.accounts(command);
    options.format(command);
  },
  parse({ from, to, accounts, format }) {
    return {
      options: options.compact({ from, to, accounts: accounts || [] }),
      output: { format },
    };
  },
  run({ options: input, output }, journal, format) {
    return format.formatPostings(journal.postings(input), output);
  },
  formatters(shared) {
    const { csvField, formatJson, formatTextTable } = shared;

    function postingCsvRows(postings) {
      return postings.flatMap((posting) => posting.amounts.map((resolvedAmount) => ({
        filename: posting.filename,
        transactionSourceLine: posting.transactionSourceLine,
        postingId: posting.postingId,
        transactionId: posting.transactionId,
        transactionDate: posting.transactionDate,
        description: posting.description,
        transactionComment: posting.transactionComment ?? '',
        transactionNotes: JSON.stringify(posting.transactionNotes),
        postingDate: posting.postingDate,
        account: posting.account,
        postingComment: posting.postingComment ?? '',
        amountQuantity: posting.amount?.quantity ?? '',
        amountCommodity: posting.amount?.commodity ?? '',
        lotCostQuantity: posting.lotCost?.quantity ?? '',
        lotCostCommodity: posting.lotCost?.commodity ?? '',
        lotCostIsTotal: posting.lotCost?.isTotal ?? '',
        costQuantity: posting.cost?.quantity ?? '',
        costCommodity: posting.cost?.commodity ?? '',
        costIsTotal: posting.cost?.isTotal ?? '',
        balanceAssignmentQuantity: posting.balanceAssignment?.quantity ?? '',
        balanceAssignmentCommodity: posting.balanceAssignment?.commodity ?? '',
        balanceAssertionQuantity: posting.balanceAssertion?.quantity ?? '',
        balanceAssertionCommodity: posting.balanceAssertion?.commodity ?? '',
        resolvedQuantity: resolvedAmount.quantity,
        resolvedCommodity: resolvedAmount.commodity,
        resolvedBalance: resolvedAmount.balance,
      })));
    }

    function formatPostingsCsv(postings) {
      const fields = [
        'postingId', 'transactionId', 'transactionDate', 'description', 'transactionComment',
        'transactionNotes', 'postingDate', 'account', 'postingComment',
        'amountQuantity', 'amountCommodity', 'lotCostQuantity', 'lotCostCommodity',
        'lotCostIsTotal', 'costQuantity', 'costCommodity', 'costIsTotal',
        'balanceAssignmentQuantity', 'balanceAssignmentCommodity',
        'balanceAssertionQuantity', 'balanceAssertionCommodity',
        'resolvedQuantity', 'resolvedCommodity', 'resolvedBalance',
        'filename', 'transactionSourceLine',
      ];
      const lines = [fields.join(',')];
      for (const row of postingCsvRows(postings)) {
        lines.push(fields.map((field) => csvField(row[field])).join(','));
      }
      return `${lines.join('\n')}\n`;
    }

    function formatPostingsText(postings) {
      if (postings.length === 0) return '';
      const rows = postingCsvRows(postings).map((row) => ({
        ...row,
        transactionNotes: JSON.parse(row.transactionNotes).join(' | '),
      }));
      return formatTextTable(rows, [
        { heading: 'Transaction', value: (row) => row.transactionDate },
        { heading: 'Posting', value: (row) => row.postingDate },
        { heading: 'Description', value: (row) => row.description },
        { heading: 'Account', value: (row) => row.account },
        { heading: 'Amount', value: (row) => row.resolvedQuantity, align: 'right' },
        { heading: 'Commodity', value: (row) => row.resolvedCommodity },
        { heading: 'Transaction comment', value: (row) => row.transactionComment },
        { heading: 'Notes', value: (row) => row.transactionNotes },
        { heading: 'Posting comment', value: (row) => row.postingComment },
        { heading: 'Filename', value: (row) => row.filename },
        { heading: 'Transaction source line', value: (row) => row.transactionSourceLine },
      ]);
    }

    function formatPostings(postings, { format }) {
      if (format === 'json') return formatJson(postings);
      if (format === 'csv') return formatPostingsCsv(postings);
      return formatPostingsText(postings);
    }

    return { formatPostings };
  },
};
