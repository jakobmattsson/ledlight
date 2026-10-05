'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1, { error: 'must be a non-empty string' }))
      .min(1, { error: 'must contain at least one account' }),
  });

  function queryAccountTransactions(database, options, _caches) {
    const { accounts } = parseOptions(optionsSchema, options, 'accountTransactions');
    const filter = accountFilter('postings.account', accounts);
    const rows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        entries.sequence AS transactionSequence,
        postings.id AS postingId,
        postings.position AS postingPosition,
        postings.report_date AS postingDate,
        amounts.position AS amountPosition,
        amounts.quantity,
        amounts.commodity,
        amounts.running_balance AS balance
      FROM transactions
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      JOIN postings ON postings.transaction_id = transactions.entry_id
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      WHERE ${filter.sql}
      ORDER BY postings.report_date, entries.sequence,
        postings.position, amounts.position
    `).all(...filter.parameters);
    const transactions = [];
    const byId = new Map();
    for (const row of rows) {
      let transaction = byId.get(row.transactionId);
      if (!transaction) {
        transaction = {
          transactionId: row.transactionId,
          transactionDate: row.transactionDate,
          description: row.description,
          sequence: row.transactionSequence,
          postings: [],
        };
        byId.set(row.transactionId, transaction);
        transactions.push(transaction);
      }
      let posting = transaction.postings.find((item) => item.id === row.postingId);
      if (!posting) {
        posting = { id: row.postingId, postingDate: row.postingDate, amounts: [] };
        transaction.postings.push(posting);
      }
      posting.amounts.push({
        quantity: row.quantity,
        commodity: row.commodity,
        balance: row.balance,
      });
    }
    return transactions
      .sort((left, right) =>
        right.transactionDate.localeCompare(left.transactionDate) ||
        right.sequence - left.sequence)
      .map((transaction) => ({
        transactionId: transaction.transactionId,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        postings: transaction.postings
          .sort((left, right) =>
            right.postingDate.localeCompare(left.postingDate) || left.id - right.id)
          .map((posting) => ({
            postingDate: posting.postingDate,
            amounts: posting.amounts,
          })),
      }));
  }

  return { name: 'accountTransactions', inputSchema: optionsSchema, execute: queryAccountTransactions };
};
