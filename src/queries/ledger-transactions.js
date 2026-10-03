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
    order: z.enum(['newest', 'oldest'], { error: 'must be newest or oldest' }),
    page: positiveInteger,
    pageSize: positiveInteger
      .refine((value) => value <= 100, { error: 'must not exceed 100' }),
  });

  function queryLedgerTransactions(database, options) {
    const { order, page, pageSize } = parseOptions(
      optionsSchema, options, 'ledgerTransactions',
    );
    const totalTransactions = database.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
    const totalPages = Math.ceil(totalTransactions / pageSize);
    const selectedPage = Math.min(page, Math.max(totalPages, 1));
    const direction = order === 'newest' ? 'DESC' : 'ASC';
    const transactionRows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.payee,
        transactions.narration,
        transactions.comment
      FROM transactions
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      ORDER BY transactions.date ${direction}, entries.sequence ${direction}
      LIMIT ? OFFSET ?
    `).all(pageSize, (selectedPage - 1) * pageSize);
    const transactions = transactionRows.map((row) => ({ ...row, postings: [] }));
    if (transactions.length > 0) {
      const byId = new Map(transactions.map((transaction) =>
        [transaction.transactionId, transaction]));
      const placeholders = transactions.map(() => '?').join(', ');
      const postingRows = database.prepare(`
        SELECT
          postings.transaction_id AS transactionId,
          postings.id AS postingId,
          postings.report_date AS postingDate,
          postings.account,
          postings.comment,
          amounts.quantity,
          amounts.commodity
        FROM postings
        JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
        WHERE postings.transaction_id IN (${placeholders})
        ORDER BY postings.transaction_id, postings.position, amounts.position
      `).all(...transactions.map((transaction) => transaction.transactionId));
      for (const row of postingRows) {
        const transaction = byId.get(row.transactionId);
        let posting = transaction.postings.find((item) => item.id === row.postingId);
        if (!posting) {
          posting = {
            id: row.postingId,
            postingDate: row.postingDate,
            account: row.account,
            comment: row.comment,
            amounts: [],
          };
          transaction.postings.push(posting);
        }
        posting.amounts.push({ quantity: row.quantity, commodity: row.commodity });
      }
    }
    return {
      order,
      page: selectedPage,
      pageSize,
      totalTransactions,
      totalPages,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        postings: transaction.postings.map(({ id: _id, ...posting }) => posting),
      })),
    };
  }

  return { name: 'ledgerTransactions', inputSchema: optionsSchema, execute: queryLedgerTransactions };
};
