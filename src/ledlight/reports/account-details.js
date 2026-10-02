'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: {
    addDecimals,
    formatDecimal,
    parseDecimal,
    registerDecimalFunctions,
  },
  publicErrors: { createError, errorCodes },
}) => {

  const invalidInput = (message) => createError(errorCodes.INVALID_API_INPUT, message, TypeError);

  function assertAccount(account) {
    if (typeof account !== 'string' || account.length === 0) {
      throw invalidInput('account must be a non-empty string');
    }
  }

  function assertDate(date, optionName) {
    if (date === undefined) return;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      throw invalidInput(`Invalid ${optionName} date: ${JSON.stringify(date)}; expected YYYY-MM-DD`);
    }
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw invalidInput(`Invalid ${optionName} date: ${JSON.stringify(date)}`);
    }
  }

  function queryAccountPostings(databasePath, { account, after }) {
    assertAccount(account);
    assertDate(after, 'after');
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const dateFilter = after === undefined
        ? ''
        : 'AND (t.date > ? OR p.report_date > ?)';
      const parameters = after === undefined ? [account] : [account, after, after];
      return database.prepare(`
      SELECT
        t.date AS transactionDate,
        p.report_date AS postingDate,
        r.commodity,
        r.quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      JOIN transactions AS t ON t.entry_id = p.transaction_id
      WHERE p.account = ? ${dateFilter}
      ORDER BY p.report_date, p.id, r.position
    `).all(...parameters);
    } finally {
      database.close();
    }
  }

  function queryAccountBalances(databasePath, { account, to }) {
    assertAccount(account);
    assertDate(to, 'to');
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      registerDecimalFunctions(database);
      const dateFilter = to === undefined ? '' : 'AND p.report_date <= ?';
      const parameters = to === undefined ? [account] : [account, to];
      return database.prepare(`
      SELECT r.commodity, decimal_sum(r.quantity) AS quantity
      FROM resolved_posting_amounts AS r
      JOIN postings AS p ON p.id = r.posting_id
      WHERE p.account = ? ${dateFilter}
      GROUP BY r.commodity
      ORDER BY r.commodity
    `).all(...parameters);
    } finally {
      database.close();
    }
  }

  function queryLedgerAccounts(databasePath) {
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      return database.prepare(`
      WITH account_names AS (
        SELECT name AS account FROM account_declarations
        UNION
        SELECT account FROM postings
      )
      SELECT
        names.account,
        (
          SELECT declarations.comment
          FROM account_declarations AS declarations
          JOIN journal_entries AS entries ON entries.id = declarations.entry_id
          WHERE declarations.name = names.account
          ORDER BY entries.sequence
          LIMIT 1
        ) AS comment,
        COUNT(DISTINCT postings.transaction_id) AS transactionCount
      FROM account_names AS names
      LEFT JOIN postings ON postings.account = names.account
      GROUP BY names.account
      ORDER BY names.account
    `).all();
    } finally {
      database.close();
    }
  }

  function queryAccountTransactions(databasePath, { account }) {
    assertAccount(account);
    const database = new Database(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    try {
      const rows = database.prepare(`
      SELECT
        transactions.entry_id AS transactionId,
        transactions.date AS transactionDate,
        transactions.status,
        transactions.code,
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
            status: row.status,
            code: row.code,
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
          status: transaction.status,
          code: transaction.code,
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
    } finally {
      database.close();
    }
  }

  function queryLedgerTransaction(databasePath, { transactionId }) {
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
        transactions.status,
        transactions.code,
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
        status: first.status,
        code: first.code,
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

  return {
    queryAccountBalances,
    queryAccountPostings,
    queryAccountTransactions,
    queryLedgerAccounts,
    queryLedgerTransaction,
  };
};
