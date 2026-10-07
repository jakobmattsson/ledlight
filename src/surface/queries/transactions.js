'use strict';

module.exports = ({
  accountFilter: { accountFilter },
  apiOptions: { accounts, parseOptions },
  zod: { z },
}) => {

  const positiveInteger = z.union([z.string(), z.number()])
    .refine((value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number > 0 && String(number) === String(value);
    }, { error: 'must be a positive integer' })
    .transform(Number);
  const optionsSchema = z.strictObject({
    accounts,
    id: positiveInteger.optional(),
    order: z.enum(['newest', 'oldest'], { error: 'must be newest or oldest' })
      .default('oldest'),
    page: positiveInteger.optional(),
    pageSize: positiveInteger.optional(),
  }).refine(({ page, pageSize }) => (page === undefined) === (pageSize === undefined), {
    error: 'page and pageSize must be provided together',
  });

  function queryTransactions(database, options, _caches) {
    const { accounts, id, order, page, pageSize } = parseOptions(
      optionsSchema, options, 'transactions',
    );
    const filters = [`EXISTS (
      SELECT 1
      FROM postings AS nonzero_postings
      JOIN resolved_posting_amounts AS nonzero_amounts
        ON nonzero_amounts.posting_id = nonzero_postings.id
      WHERE nonzero_postings.transaction_id = transactions.entry_id
        AND decimal_cmp(nonzero_amounts.quantity, '0') != 0
    )`];
    const filterParameters = [];
    if (id !== undefined) {
      filters.push('transactions.entry_id = ?');
      filterParameters.push(id);
    }
    if (accounts.length > 0) {
      const accountMatch = accountFilter('matching_postings.account', accounts);
      filters.push(`EXISTS (
        SELECT 1
        FROM postings AS matching_postings
        WHERE matching_postings.transaction_id = transactions.entry_id
          AND ${accountMatch.sql}
      )`);
      filterParameters.push(...accountMatch.parameters);
    }
    const filter = filters.length === 0 ? '' : `WHERE ${filters.join(' AND ')}`;
    const totalTransactions = database.prepare(`
      SELECT COUNT(*) AS count
      FROM transactions
      ${filter}
    `).get(...filterParameters).count;
    const totalPages = page === undefined ? undefined : Math.ceil(totalTransactions / pageSize);
    const selectedPage = page === undefined
      ? undefined
      : Math.min(page, Math.max(totalPages, 1));
    const paginationClause = page === undefined ? '' : 'LIMIT ? OFFSET ?';
    const paginationParameters = page === undefined
      ? []
      : [pageSize, (selectedPage - 1) * pageSize];
    const direction = order === 'newest' ? 'DESC' : 'ASC';
    const transactionRows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.description,
        transactions.comment
      FROM transactions
      ${filter}
      ORDER BY transactions.entry_id ${direction}
      ${paginationClause}
    `).all(...filterParameters, ...paginationParameters);
    const transactions = transactionRows.map((row) => ({ ...row, notes: [], postings: [] }));
    if (transactions.length > 0) {
      const byId = new Map(transactions.map((transaction) =>
        [transaction.transactionId, transaction]));
      const transactionIds = transactions.map((transaction) => transaction.transactionId);
      const batches = [];
      for (let offset = 0; offset < transactionIds.length; offset += 500) {
        batches.push(transactionIds.slice(offset, offset + 500));
      }
      const postingRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT
            postings.transaction_id AS transactionId,
            postings.id AS postingId,
            postings.posting_date AS postingDate,
            postings.line AS sourceLine,
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
        `).all(...ids);
      });
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
          Object.defineProperty(posting, 'sourceLine', { value: row.sourceLine });
          transaction.postings.push(posting);
        }
        posting.amounts.push({ quantity: row.quantity, commodity: row.commodity });
      }
      const noteRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT transaction_id AS transactionId, line, text
          FROM transaction_notes
          WHERE transaction_id IN (${placeholders})
          ORDER BY transaction_id, position
        `).all(...ids);
      });
      for (const row of noteRows) {
        const transaction = byId.get(row.transactionId);
        transaction.notes.push(row.text);
        if (!Object.hasOwn(transaction, 'positionedNotes')) {
          Object.defineProperty(transaction, 'positionedNotes', { value: [] });
        }
        transaction.positionedNotes.push({ line: row.line, text: row.text });
      }
    }
    return {
      order,
      ...(page === undefined ? {} : { page: selectedPage, pageSize }),
      totalTransactions,
      ...(page === undefined ? {} : { totalPages }),
      transactions: transactions.map((transaction) => {
        const result = {
          ...transaction,
          postings: transaction.postings.map(({ id: _id, ...posting }, index) => {
            Object.defineProperty(posting, 'sourceLine', {
              value: transaction.postings[index].sourceLine,
            });
            return posting;
          }),
        };
        if (Object.hasOwn(transaction, 'positionedNotes')) {
          Object.defineProperty(result, 'positionedNotes', {
            value: transaction.positionedNotes,
          });
        }
        return result;
      }),
    };
  }

  return { inputSchema: optionsSchema, execute: queryTransactions };
};
