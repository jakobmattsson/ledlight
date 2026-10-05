'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { parseOptions },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts: z.array(z.string().min(1, { error: 'must be a non-empty string' })).default([]),
    from: z.iso.date({ error: 'Invalid --from date' }).optional(),
    to: z.iso.date({ error: 'Invalid --to date' }).optional(),
  }).superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: 'custom',
        message: `--from date ${input.from} is after --to date ${input.to}`,
        path: ['from'],
      });
    }
  });

  function queryPostings(database, options, _caches) {
    const { accounts, from, to } = parseOptions(optionsSchema, options, 'postings');
    const clauses = [
      "postings.report_date >= COALESCE(?, '0000-00-00')",
      "postings.report_date <= COALESCE(?, '9999-12-31')",
    ];
    const parameters = [from ?? null, to ?? null];
    if (accounts.length > 0) {
      const match = accountFilter('postings.account', accounts);
      clauses.push(match.sql);
      parameters.push(...match.parameters);
    }
    const rows = database.prepare(`
      SELECT
        postings.id AS postingId,
        postings.transaction_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.comment AS transactionComment,
        postings.report_date AS postingDate,
        postings.account,
        postings.comment AS postingComment,
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
        amounts.commodity,
        amounts.running_balance AS balance
      FROM postings
      JOIN transactions ON transactions.entry_id = postings.transaction_id
      JOIN journal_entries AS entries ON entries.id = transactions.entry_id
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      WHERE ${clauses.join('\n        AND ')}
      ORDER BY entries.sequence, postings.position, amounts.position
    `).all(...parameters);
    const postings = [];
    const byId = new Map();
    for (const row of rows) {
      let posting = byId.get(row.postingId);
      if (!posting) {
        posting = {
          postingId: row.postingId,
          transactionId: row.transactionId,
          transactionDate: row.transactionDate,
          description: row.description,
          transactionComment: row.transactionComment,
          transactionNotes: [],
          postingDate: row.postingDate,
          account: row.account,
          postingComment: row.postingComment,
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
        byId.set(row.postingId, posting);
        postings.push(posting);
      }
      posting.amounts.push({
        quantity: row.quantity,
        commodity: row.commodity,
        balance: row.balance,
      });
    }
    if (postings.length > 0) {
      const transactionIds = [...new Set(postings.map(({ transactionId }) => transactionId))];
      const placeholders = transactionIds.map(() => '?').join(', ');
      const notesByTransaction = new Map(transactionIds.map((id) => [id, []]));
      const notes = database.prepare(`
        SELECT transaction_id AS transactionId, text
        FROM transaction_notes
        WHERE transaction_id IN (${placeholders})
        ORDER BY transaction_id, position
      `).all(...transactionIds);
      for (const note of notes) notesByTransaction.get(note.transactionId).push(note.text);
      for (const posting of postings) {
        posting.transactionNotes = [...notesByTransaction.get(posting.transactionId)];
      }
    }
    return postings;
  }

  return { name: 'postings', inputSchema: optionsSchema, execute: queryPostings };
};
