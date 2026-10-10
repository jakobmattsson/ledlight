'use strict';

function postingCsvRows(postings) {
  return postings.flatMap((posting) => posting.amounts.map((resolvedAmount) => ({
    filename: posting.filename,
    transactionSourceLine: posting.transactionSourceLine,
    postingId: posting.postingId,
    transactionId: posting.transactionId,
    transactionDate: posting.transactionDate,
    description: posting.description,
    transactionComments: JSON.stringify(posting.transactionComments),
    transactionTags: JSON.stringify(posting.transactionTags || []),
    postingDate: posting.postingDate,
    account: posting.account,
    postingComments: JSON.stringify(posting.postingComments),
    postingTags: JSON.stringify(posting.postingTags || []),
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
  examples: [
    'ledlight postings --file main.ledger',
    'ledlight postings --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "Assets:*"',
  ],
  configure(command) {
    options.journal(command);
    options.dateRange(
      command,
      'include postings dated on or after YYYY-MM-DD',
      'include postings dated on or before YYYY-MM-DD',
    );
    options.accounts(command);
    options.format(command);
  },
  formatCsv(postings, _cliOptions, { csvField }) {
    const fields = [
      'postingId', 'transactionId', 'transactionDate', 'description',
      'transactionComments', 'transactionTags', 'postingDate', 'account',
      'postingComments', 'postingTags',
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
      transactionComments: JSON.parse(row.transactionComments).join(' | '),
      transactionTags: JSON.parse(row.transactionTags)
        .map(({ name, value }) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
      postingComments: JSON.parse(row.postingComments).join(' | '),
      postingTags: JSON.parse(row.postingTags)
        .map(({ name, value }) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
    }));
    return formatTextTable(rows, [
      { heading: 'Transaction', value: (row) => row.transactionDate },
      { heading: 'Posting', value: (row) => row.postingDate },
      { heading: 'Description', value: (row) => row.description },
      { heading: 'Account', value: (row) => row.account },
      { heading: 'Amount', value: (row) => row.resolvedQuantity, align: 'right' },
      { heading: 'Commodity', value: (row) => row.resolvedCommodity },
      { heading: 'Transaction comments', value: (row) => row.transactionComments },
      { heading: 'Transaction tags', value: (row) => row.transactionTags },
      { heading: 'Posting comments', value: (row) => row.postingComments },
      { heading: 'Posting tags', value: (row) => row.postingTags },
      { heading: 'Filename', value: (row) => row.filename },
      { heading: 'Transaction source line', value: (row) => row.transactionSourceLine },
    ]);
  },
});
