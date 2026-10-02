'use strict';

module.exports = ({
  path,
  sqlite: Database,
}) => {

  function positiveInteger(value, name) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1 || String(number) !== String(value)) {
      throw new Error(`${name} must be a positive integer`);
    }
    return number;
  }

  function queryLedgerTransactions(databasePath, {
    order,
    page,
    pageSize,
  }) {
    if (!['newest', 'oldest'].includes(order)) {
      throw new Error('order must be newest or oldest');
    }
    const requestedPage = positiveInteger(page, 'page');
    const normalizedPageSize = positiveInteger(pageSize, 'pageSize');
    if (normalizedPageSize > 100) throw new Error('pageSize must not exceed 100');
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const totalTransactions = database.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
      const totalPages = Math.ceil(totalTransactions / normalizedPageSize);
      const selectedPage = Math.min(requestedPage, Math.max(totalPages, 1));
      const direction = order === 'newest' ? 'DESC' : 'ASC';
      const transactionRows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.status,
        transactions.code,
        transactions.description,
        transactions.payee,
        transactions.narration,
        transactions.comment
      FROM transactions
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      ORDER BY transactions.date ${direction}, entries.sequence ${direction}
      LIMIT ? OFFSET ?
    `).all(normalizedPageSize, (selectedPage - 1) * normalizedPageSize);
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
        pageSize: normalizedPageSize,
        totalTransactions,
        totalPages,
        transactions: transactions.map((transaction) => ({
          ...transaction,
          postings: transaction.postings.map(({ id: _id, ...posting }) => posting),
        })),
      };
    } finally {
      database.close();
    }
  }

  return { queryLedgerTransactions };
};
