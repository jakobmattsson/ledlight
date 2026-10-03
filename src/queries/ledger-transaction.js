'use strict';

module.exports = ({
  path,
  sqlite: Database,
  apiOptions: { parseOptions },
  publicErrors: { createError, errorCodes },
  zod: { z },
}) => {
  const optionsSchema = z.strictObject({
    transactionId: z.union([z.string(), z.number()]),
  });
  const invalidInput = (message) => createError(errorCodes.INVALID_API_INPUT, message, TypeError);

  function queryLedgerTransaction(databasePath, options) {
    const { transactionId } = parseOptions(optionsSchema, options, 'ledgerTransaction');
    const id = Number(transactionId);
    if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== String(transactionId)) {
      throw invalidInput('transactionId must be a positive integer');
    }
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const rows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.payee,
        transactions.narration,
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
    `).all(id);
      if (rows.length === 0) return null;
      const first = rows[0];
      const transaction = {
        transactionId: first.transactionId,
        transactionDate: first.transactionDate,
        description: first.description,
        payee: first.payee,
        narration: first.narration,
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
    } finally {
      database.close();
    }
  }

  return { optionsSchema, queryLedgerTransaction };
};
