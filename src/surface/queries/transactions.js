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
        AND decimal_cmp(nonzero_amounts.amount_quantity, '0') != 0
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
        transactions.description
      FROM transactions
      ${filter}
      ORDER BY transactions.entry_id ${direction}
      ${paginationClause}
    `).all(...filterParameters, ...paginationParameters);
    const transactions = transactionRows.map((row) => ({ ...row, comments: [], postings: [] }));
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
            postings.account,
            postings.amount_quantity AS amountQuantity,
            postings.amount_commodity AS amountCommodity,
            postings.lot_cost_quantity AS lotCostQuantity,
            postings.lot_cost_commodity AS lotCostCommodity,
            postings.lot_cost_is_total AS lotCostIsTotal,
            postings.cost_quantity AS costQuantity,
            postings.cost_commodity AS costCommodity,
            postings.cost_is_total AS costIsTotal,
            postings.balance_quantity AS balanceQuantity,
            postings.balance_commodity AS balanceCommodity,
            amounts.amount_quantity AS quantity,
            amounts.amount_commodity AS commodity
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
          const balance = row.balanceQuantity === null
            ? null
            : { quantity: row.balanceQuantity, commodity: row.balanceCommodity };
          posting = {
            id: row.postingId,
            postingDate: row.postingDate,
            account: row.account,
            comments: [],
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
            balanceAssignment: row.amountQuantity === null ? balance : null,
            balanceAssertion: row.amountQuantity === null ? null : balance,
            amounts: [],
          };
          transaction.postings.push(posting);
        }
        posting.amounts.push({ quantity: row.quantity, commodity: row.commodity });
      }
      const transactionCommentRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT transaction_id AS transactionId, text
          FROM comments
          WHERE transaction_id IN (${placeholders})
          ORDER BY transaction_id, position
        `).all(...ids);
      });
      const postingCommentRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT comments.posting_id AS postingId, comments.text
          FROM postings
          JOIN comments ON comments.posting_id = postings.id
          WHERE postings.transaction_id IN (${placeholders})
          ORDER BY postings.transaction_id, postings.position, comments.position
        `).all(...ids);
      });
      const transactionTagRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT transaction_id AS transactionId, name, value
          FROM tags
          WHERE transaction_id IN (${placeholders})
          ORDER BY transaction_id, position, ordinal
        `).all(...ids);
      });
      const postingTagRows = batches.flatMap((ids) => {
        const placeholders = ids.map(() => '?').join(', ');
        return database.prepare(`
          SELECT tags.posting_id AS postingId, tags.name, tags.value
          FROM postings
          JOIN tags ON tags.posting_id = postings.id
          WHERE postings.transaction_id IN (${placeholders})
          ORDER BY postings.transaction_id, postings.position, tags.position, tags.ordinal
        `).all(...ids);
      });
      const postingsById = new Map(transactions.flatMap((transaction) =>
        transaction.postings.map((posting) => [posting.id, posting])));
      for (const row of [...transactionCommentRows, ...postingCommentRows]) {
        const owner = row.postingId === undefined
          ? byId.get(row.transactionId)
          : postingsById.get(row.postingId);
        if (!owner) continue;
        owner.comments.push(row.text);
      }
      for (const row of [...transactionTagRows, ...postingTagRows]) {
        const owner = row.postingId === undefined
          ? byId.get(row.transactionId)
          : postingsById.get(row.postingId);
        if (!owner) continue;
        if (!owner.tags) owner.tags = [];
        owner.tags.push({ name: row.name, value: row.value });
      }
    }
    return {
      order,
      ...(page === undefined ? {} : { page: selectedPage, pageSize }),
      totalTransactions,
      ...(page === undefined ? {} : { totalPages }),
      transactions: transactions.map((transaction) => ({
        ...transaction,
        postings: transaction.postings.map(({ id: _id, ...posting }) => posting),
      })),
    };
  }

  return { inputSchema: optionsSchema, execute: queryTransactions };
};
