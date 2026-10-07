'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { accounts, dateRange, validateDateRange, parseOptions },
  zod: { z },
}) => {

  const optionsSchema = z.strictObject({
    accounts,
    ...dateRange,
  }).superRefine(validateDateRange);

  function queryPostings(database, options, _caches) {
    const { accounts, from, to } = parseOptions(optionsSchema, options, 'postings');
    const clauses = [];
    const parameters = [];
    if (from) {
      clauses.push('postings.posting_date >= ?');
      parameters.push(from);
    }
    if (to) {
      clauses.push('postings.posting_date <= ?');
      parameters.push(to);
    }
    if (accounts.length > 0) {
      const match = accountFilter('postings.account', accounts);
      clauses.push(match.sql);
      parameters.push(...match.parameters);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join('\n        AND ')}`;
    const rows = database.prepare(`
      SELECT
        postings.id AS postingId,
        postings.transaction_id AS transactionId,
        transactions.date AS transactionDate,
        source_files.path AS filename,
        entries.line AS transactionSourceLine,
        transactions.description,
        postings.posting_date AS postingDate,
        postings.account,
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
      JOIN source_files ON source_files.id = entries.source_file_id
      JOIN resolved_posting_amounts AS amounts ON amounts.posting_id = postings.id
      ${where}
      ORDER BY transactions.entry_id, postings.position, amounts.position
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
          filename: row.filename,
          transactionSourceLine: row.transactionSourceLine,
          description: row.description,
          transactionNotes: [],
          postingDate: row.postingDate,
          account: row.account,
          postingNotes: [],
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
      const notesByTransaction = new Map(transactionIds.map((id) => [id, []]));
      for (let offset = 0; offset < transactionIds.length; offset += 500) {
        const ids = transactionIds.slice(offset, offset + 500);
        const placeholders = ids.map(() => '?').join(', ');
        const transactionNotes = database.prepare(`
          SELECT transaction_id AS transactionId, text
          FROM notes
          WHERE transaction_id IN (${placeholders})
          ORDER BY transaction_id, position
        `).all(...ids);
        for (const note of transactionNotes) {
          notesByTransaction.get(note.transactionId).push(note.text);
        }
        const postingNotes = database.prepare(`
          SELECT notes.posting_id AS postingId, notes.text
          FROM postings
          JOIN notes ON notes.posting_id = postings.id
          WHERE postings.transaction_id IN (${placeholders})
          ORDER BY postings.transaction_id, postings.position, notes.position
        `).all(...ids);
        for (const note of postingNotes) byId.get(note.postingId)?.postingNotes.push(note.text);
      }
      for (const posting of postings) {
        posting.transactionNotes = [...notesByTransaction.get(posting.transactionId)];
      }
    }
    return postings;
  }

  return { inputSchema: optionsSchema, execute: queryPostings };
};
