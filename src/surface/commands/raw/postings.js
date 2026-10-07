'use strict';

function postingCsvRows(postings) {
  return postings.flatMap((posting) => posting.amounts.map((resolvedAmount) => ({
    filename: posting.filename,
    transactionSourceLine: posting.transactionSourceLine,
    postingId: posting.postingId,
    transactionId: posting.transactionId,
    transactionDate: posting.transactionDate,
    description: posting.description,
    transactionNotes: JSON.stringify(posting.transactionNotes),
    postingDate: posting.postingDate,
    account: posting.account,
    postingNotes: JSON.stringify(posting.postingNotes),
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

module.exports = ({ cliOptions: options }) => ({
  description: 'show postings',
  configure(command) {
    options.journal(command);
    options.date(command, '--from <date>', 'include postings on or after YYYY-MM-DD');
    options.date(command, '--to <date>', 'include postings on or before YYYY-MM-DD');
    options.accounts(command);
    options.format(command);
  },
  formatCsv(postings, _cliOptions, { csvField }) {
    const fields = [
      'postingId', 'transactionId', 'transactionDate', 'description',
      'transactionNotes', 'postingDate', 'account', 'postingNotes',
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
  },
  formatText(postings, _cliOptions, { formatTextTable }) {
    if (postings.length === 0) return '';
    const rows = postingCsvRows(postings).map((row) => ({
      ...row,
      transactionNotes: JSON.parse(row.transactionNotes).join(' | '),
      postingNotes: JSON.parse(row.postingNotes).join(' | '),
    }));
    return formatTextTable(rows, [
      { heading: 'Transaction', value: (row) => row.transactionDate },
      { heading: 'Posting', value: (row) => row.postingDate },
      { heading: 'Description', value: (row) => row.description },
      { heading: 'Account', value: (row) => row.account },
      { heading: 'Amount', value: (row) => row.resolvedQuantity, align: 'right' },
      { heading: 'Commodity', value: (row) => row.resolvedCommodity },
      { heading: 'Transaction notes', value: (row) => row.transactionNotes },
      { heading: 'Posting notes', value: (row) => row.postingNotes },
      { heading: 'Filename', value: (row) => row.filename },
      { heading: 'Transaction source line', value: (row) => row.transactionSourceLine },
    ]);
  },
});
