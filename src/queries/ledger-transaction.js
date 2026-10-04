'use strict';

module.exports = ({
  apiOptions: { parseOptions },
  zod: { z },
}) => {
  const positiveInteger = z.union([z.string(), z.number()])
    .refine((value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number > 0 && String(number) === String(value);
    }, { error: 'must be a positive integer' })
    .transform(Number);
  const optionsSchema = z.strictObject({
    transactionId: positiveInteger,
  });

  function queryLedgerTransaction(database, options, _caches) {
    const { transactionId } = parseOptions(optionsSchema, options, 'ledgerTransaction');
    const rows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.comment AS transactionComment,
        postings.id AS postingId,
        postings.position AS postingPosition,
        postings.report_date AS postingDate,
        postings.account,
        postings.comment AS postingComment,
        amounts.quantity,
        amounts.commodity
      FROM transactions
      JOIN postings ON postings.transaction_id = transactions.entry_id
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      WHERE transactions.entry_id = ?
      ORDER BY postings.position, amounts.position
    `).all(transactionId);
    if (rows.length === 0) return null;
    const first = rows[0];
    const transaction = {
      transactionId: first.transactionId,
      transactionDate: first.transactionDate,
      description: first.description,
      comment: first.transactionComment,
      postings: [],
    };
    for (const row of rows) {
      let posting = transaction.postings.find((item) => item.id === row.postingId);
      if (!posting) {
        posting = {
          id: row.postingId,
          postingDate: row.postingDate,
          account: row.account,
          comment: row.postingComment,
          amounts: [],
        };
        transaction.postings.push(posting);
      }
      posting.amounts.push({ quantity: row.quantity, commodity: row.commodity });
    }
    return {
      ...transaction,
      postings: transaction.postings.map((posting) => ({
        postingDate: posting.postingDate,
        account: posting.account,
        comment: posting.comment,
        amounts: posting.amounts,
      })),
    };
  }

  return { name: 'ledgerTransaction', inputSchema: optionsSchema, execute: queryLedgerTransaction };
};
