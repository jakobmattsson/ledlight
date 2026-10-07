'use strict';

module.exports = ({ decimal: { formatDecimal, parseDecimal } }) => {
  const quantityText = (quantity) => formatDecimal(parseDecimal(quantity));
  const amountText = (quantity, commodity) => `${quantityText(quantity)} ${commodity}`;
  const withComment = (text, comment) => comment === null ? text : `${text}  ; ${comment}`;

  function postingText(posting, accountWidth) {
    const expression = [];
    if (posting.amountQuantity !== null) {
      expression.push(amountText(posting.amountQuantity, posting.amountCommodity));
    }
    if (posting.lotCostQuantity !== null) {
      const braces = posting.lotCostIsTotal ? ['{{', '}}'] : ['{', '}'];
      expression.push(`${braces[0]}${amountText(
        posting.lotCostQuantity, posting.lotCostCommodity,
      )}${braces[1]}`);
    }
    if (posting.costQuantity !== null) {
      expression.push(`${posting.costIsTotal ? '@@' : '@'} ${amountText(
        posting.costQuantity, posting.costCommodity,
      )}`);
    }
    if (posting.balanceAssignmentQuantity !== null) {
      expression.push(`= ${amountText(
        posting.balanceAssignmentQuantity, posting.balanceAssignmentCommodity,
      )}`);
    }
    if (posting.balanceAssertionQuantity !== null) {
      expression.push(`= ${amountText(
        posting.balanceAssertionQuantity, posting.balanceAssertionCommodity,
      )}`);
    }
    const account = expression.length === 0
      ? posting.account
      : posting.account.padEnd(accountWidth);
    const line = `    ${account}${expression.length ? `  ${expression.join(' ')}` : ''}`;
    return withComment(line, posting.comment);
  }

  function transactionText(entry) {
    const lines = [withComment(`${entry.date} ${entry.description}`, entry.comment)];
    const accountWidth = Math.max(0, ...entry.postings.map(({ account }) => account.length));
    const children = [
      ...entry.postings.map((posting) => ({
        line: posting.line,
        text: postingText(posting, accountWidth),
      })),
      ...entry.notes.map((note) => ({ line: note.line, text: `    ; ${note.text}` })),
    ].sort((left, right) => left.line - right.line);
    lines.push(...children.map(({ text }) => text));
    return lines.join('\n');
  }

  function entryText(entry) {
    switch (entry.type) {
      case 'account':
      case 'tag':
        return withComment(`${entry.type} ${entry.name}`, entry.comment);
      case 'commodity':
        return [
          withComment(`commodity ${entry.symbol}`, entry.comment),
          ...(entry.isDefault ? ['  default'] : []),
          ...(entry.format === null ? [] : [`  format ${entry.format}`]),
        ].join('\n');
      case 'price':
        return withComment(
          `P ${entry.date} ${entry.baseCommodity} ` +
            amountText(entry.quoteQuantity, entry.quoteCommodity),
          entry.comment,
        );
      case 'transaction':
        return transactionText(entry);
      default:
        throw new Error(`Cannot print unsupported journal entry type: ${entry.type}`);
    }
  }

  function printJournal(database) {
    const ids = database.prepare('SELECT id FROM journal_entries ORDER BY id').pluck().all();
    if (ids.length === 0) return '';
    const entries = new Map();
    const load = (type, sql, decorate) => {
      for (const row of database.prepare(sql).all()) {
        entries.set(row.entryId, { type, ...(decorate ? decorate(row) : row) });
      }
    };

    load('transaction', `
      SELECT entry_id AS entryId, date, description, comment FROM transactions
    `, (row) => ({ ...row, postings: [], notes: [] }));
    load('account', `
      SELECT entry_id AS entryId, name, comment FROM account_declarations
    `);
    load('tag', `
      SELECT entry_id AS entryId, name, comment FROM tag_declarations
    `);
    load('commodity', `
      SELECT entry_id AS entryId, symbol, comment, format, is_default AS isDefault
      FROM commodity_declarations
    `);
    load('price', `
      SELECT entry_id AS entryId, date, base_commodity AS baseCommodity,
        quote_quantity AS quoteQuantity, quote_commodity AS quoteCommodity, comment
      FROM prices
    `);

    for (const posting of database.prepare(`
      SELECT transaction_id AS transactionId, line, account,
        amount_quantity AS amountQuantity, amount_commodity AS amountCommodity,
        lot_cost_quantity AS lotCostQuantity, lot_cost_commodity AS lotCostCommodity,
        lot_cost_is_total AS lotCostIsTotal,
        cost_quantity AS costQuantity, cost_commodity AS costCommodity,
        cost_is_total AS costIsTotal,
        balance_assignment_quantity AS balanceAssignmentQuantity,
        balance_assignment_commodity AS balanceAssignmentCommodity,
        balance_assertion_quantity AS balanceAssertionQuantity,
        balance_assertion_commodity AS balanceAssertionCommodity, comment
      FROM postings ORDER BY transaction_id, position
    `).all()) {
      entries.get(posting.transactionId).postings.push(posting);
    }
    for (const note of database.prepare(`
      SELECT transaction_id AS transactionId, line, text
      FROM transaction_notes ORDER BY transaction_id, position
    `).all()) {
      entries.get(note.transactionId).notes.push(note);
    }

    return `${ids.map((id) => entryText(entries.get(id))).join('\n\n')}\n`;
  }

  return { printJournal };
};
