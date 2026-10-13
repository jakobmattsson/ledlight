'use strict';

import type { LedgerTag, PostingRow } from '../../../../../public-api';
import type { Command } from 'commander';

function postingCsvRows(postings: PostingRow[]) {
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
  configure(command: Command) {
    options.journal(command);
    options.dateRange(
      command,
      'include postings dated on or after YYYY-MM-DD',
      'include postings dated on or before YYYY-MM-DD',
    );
    options.accounts(command);
    options.format(command);
  },
  formatCsv(postings: PostingRow[], _cliOptions: unknown, { csvField }: { csvField(value: unknown): string }) {
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
      lines.push(fields.map((field: string) => csvField(row[field as keyof typeof row])).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(postings: PostingRow[], _cliOptions: unknown, { formatTextTable }: { formatTextTable(rows: unknown[], columns: unknown[]): string }) {
    if (postings.length === 0) return '';
    const rows = postingCsvRows(postings).map((row: ReturnType<typeof postingCsvRows>[number]) => ({
      ...row,
      transactionComments: JSON.parse(row.transactionComments).join(' | '),
      transactionTags: JSON.parse(row.transactionTags)
        .map(({ name, value }: LedgerTag) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
      postingComments: JSON.parse(row.postingComments).join(' | '),
      postingTags: JSON.parse(row.postingTags)
        .map(({ name, value }: LedgerTag) => value === null ? `:${name}:` : `${name}: ${value}`).join(' | '),
    }));
    return formatTextTable(rows, [
      { heading: 'Transaction', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.transactionDate },
      { heading: 'Posting', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.postingDate },
      { heading: 'Description', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.description },
      { heading: 'Account', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.account },
      { heading: 'Amount', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.resolvedQuantity, align: 'right' },
      { heading: 'Commodity', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.resolvedCommodity },
      { heading: 'Transaction comments', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.transactionComments },
      { heading: 'Transaction tags', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.transactionTags },
      { heading: 'Posting comments', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.postingComments },
      { heading: 'Posting tags', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.postingTags },
      { heading: 'Filename', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.filename },
      { heading: 'Transaction source line', value: (row: ReturnType<typeof postingCsvRows>[number]) => row.transactionSourceLine },
    ]);
  },
});
