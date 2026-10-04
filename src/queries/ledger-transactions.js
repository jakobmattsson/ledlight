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
    order: z.enum(['newest', 'oldest'], { error: 'must be newest or oldest' })
      .default('oldest'),
    page: positiveInteger.default(1),
    pageSize: positiveInteger
      .refine((value) => value <= 100, { error: 'must not exceed 100' })
      .default(100),
  });

  function queryLedgerTransactions(database, options, _caches) {
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
        transactions.comment
      FROM transactions
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      ORDER BY transactions.date ${direction}, entries.sequence ${direction}
      LIMIT ? OFFSET ?
    `).all(pageSize, (selectedPage - 1) * pageSize);
    const transactions = transactionRows.map((row) => ({ ...row, notes: [], postings: [] }));
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
          postings.amount_quantity AS amountQuantity,
          postings.amount_commodity AS amountCommodity,
          postings.lot_cost_quantity AS lotCostQuantity,
          postings.lot_cost_commodity AS lotCostCommodity,
          postings.lot_cost_is_total AS lotCostIsTotal,
          postings.cost_quantity AS costQuantity,
          postings.cost_commodity AS costCommodity,
          postings.cost_is_total AS costIsTotal,
          postings.balance_assignment_quantity AS balanceAssignmentQuantity,
          postings.balance_assignment_commodity AS balanceAssignmentCommodity,
          postings.balance_assertion_quantity AS balanceAssertionQuantity,
          postings.balance_assertion_commodity AS balanceAssertionCommodity,
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
            amount: row.amountQuantity === null
              ? null
              : { quantity: row.amountQuantity, commodity: row.amountCommodity },
            lotCost: row.lotCostQuantity === null
              ? null
              : {
                quantity: row.lotCostQuantity,
                commodity: row.lotCostCommodity,
                isTotal: Boolean(row.lotCostIsTotal),
              },
            cost: row.costQuantity === null
              ? null
              : {
                quantity: row.costQuantity,
                commodity: row.costCommodity,
                isTotal: Boolean(row.costIsTotal),
              },
            balanceAssignment: row.balanceAssignmentQuantity === null
              ? null
              : {
                quantity: row.balanceAssignmentQuantity,
                commodity: row.balanceAssignmentCommodity,
              },
            balanceAssertion: row.balanceAssertionQuantity === null
              ? null
              : {
                quantity: row.balanceAssertionQuantity,
                commodity: row.balanceAssertionCommodity,
              },
            amounts: [],
          };
          transaction.postings.push(posting);
        }
        posting.amounts.push({ quantity: row.quantity, commodity: row.commodity });
      }
      const noteRows = database.prepare(`
        SELECT transaction_id AS transactionId, text
        FROM transaction_notes
        WHERE transaction_id IN (${placeholders})
        ORDER BY transaction_id, position
      `).all(...transactions.map((transaction) => transaction.transactionId));
      for (const row of noteRows) byId.get(row.transactionId).notes.push(row.text);
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
