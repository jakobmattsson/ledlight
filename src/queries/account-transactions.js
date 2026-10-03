'use strict';

module.exports = ({
  decimal: { addDecimals, formatDecimal, parseDecimal },
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    account: z.string().min(1, { error: 'must be a non-empty string' }),
  });

  function queryAccountTransactions(database, options) {
    const { account } = parseOptions(optionsSchema, options, 'accountTransactions');
    const rows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.payee,
        transactions.narration,
        entries.sequence AS transactionSequence,
        postings.id AS postingId,
        postings.position AS postingPosition,
        postings.report_date AS postingDate,
        amounts.position AS amountPosition,
        amounts.quantity,
        amounts.commodity
      FROM transactions
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      JOIN postings ON postings.transaction_id = transactions.entry_id
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      WHERE postings.account = ?
      ORDER BY postings.report_date, entries.sequence,
        postings.position, amounts.position
    `).all(account);
    const transactions = [];
    const byId = new Map();
    const balances = new Map();
    for (const row of rows) {
      const balance = addDecimals(
        balances.get(row.commodity) ?? parseDecimal('0'),
        parseDecimal(row.quantity),
      );
      balances.set(row.commodity, balance);
      let transaction = byId.get(row.transactionId);
      if (!transaction) {
        transaction = {
          transactionId: row.transactionId,
          transactionDate: row.transactionDate,
          description: row.description,
          payee: row.payee,
          narration: row.narration,
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
        balance: formatDecimal(balance),
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
        payee: transaction.payee,
        narration: transaction.narration,
        postings: transaction.postings
          .sort((left, right) =>
            right.postingDate.localeCompare(left.postingDate) || left.id - right.id)
          .map((posting) => ({
            postingDate: posting.postingDate,
            amounts: posting.amounts,
          })),
      }));
  }

  return { optionsSchema, queryAccountTransactions };
};
