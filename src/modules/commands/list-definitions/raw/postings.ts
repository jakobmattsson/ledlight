'use strict';

function postingCsvRows(postings: any) {
  return postings.flatMap((posting: any) => posting.amounts.map((resolvedAmount: any) => ({
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

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show postings',
  examples: [
    'ledlight postings --file main.ledger',
    'ledlight postings --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "Assets:*"',
  ],
  configure(command: any) {
    options.journal(command);
    options.dateRange(
      command,
      'include postings dated on or after YYYY-MM-DD',
      'include postings dated on or before YYYY-MM-DD',
    );
    options.accounts(command);
    options.format(command);
  },
  formatCsv(postings: any, _cliOptions: any, { csvField }: any) {
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
      lines.push(fields.map((field: any) => csvField(row[field])).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(postings: any, _cliOptions: any, { formatTextTable }: any) {
    if (postings.length === 0) return '';
    const rows = postingCsvRows(postings).map((row: any) => ({
      ...row,
      transactionComments: JSON.parse(row.transactionComments).join(' | '),
      transactionTags: JSON.parse(row.transactionTags)
        .map(({ name, value }: any) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
      postingComments: JSON.parse(row.postingComments).join(' | '),
      postingTags: JSON.parse(row.postingTags)
        .map(({ name, value }: any) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
    }));
    return formatTextTable(rows, [
      { heading: 'Transaction', value: (row: any) => row.transactionDate },
      { heading: 'Posting', value: (row: any) => row.postingDate },
      { heading: 'Description', value: (row: any) => row.description },
      { heading: 'Account', value: (row: any) => row.account },
      { heading: 'Amount', value: (row: any) => row.resolvedQuantity, align: 'right' },
      { heading: 'Commodity', value: (row: any) => row.resolvedCommodity },
      { heading: 'Transaction comments', value: (row: any) => row.transactionComments },
      { heading: 'Transaction tags', value: (row: any) => row.transactionTags },
      { heading: 'Posting comments', value: (row: any) => row.postingComments },
      { heading: 'Posting tags', value: (row: any) => row.postingTags },
      { heading: 'Filename', value: (row: any) => row.filename },
      { heading: 'Transaction source line', value: (row: any) => row.transactionSourceLine },
    ]);
  },
});
