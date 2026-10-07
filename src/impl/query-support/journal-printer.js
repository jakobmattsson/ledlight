'use strict';

module.exports = ({ decimal: { formatDecimal, parseDecimal } }) => {
  const quantityText = (quantity) => formatDecimal(parseDecimal(quantity));
  const amountText = (quantity, commodity) => `${quantityText(quantity)} ${commodity}`;
  const withComment = (text, comment) => comment === null ? text : `${text}  ; ${comment}`;
  const tagText = ({ name, value }) => value === null ? `:${name}:` : `${name}: ${value}`;

  function metadataLines(owner) {
    const byPosition = new Map();
    for (const { position, text } of owner.comments) {
      byPosition.set(position, { comment: text, tags: [] });
    }
    for (const tag of owner.tags) {
      if (!byPosition.has(tag.position)) byPosition.set(tag.position, { tags: [] });
      byPosition.get(tag.position).tags.push(tag);
    }
    return [...byPosition].sort(([left], [right]) => left - right)
      .map(([position, { comment, tags }]) => {
        const tagsText = tags.length > 0 && tags.every(({ value }) => value === null)
          ? `:${tags.map(({ name }) => name).join(':')}:`
          : tags.map(tagText).join(' ');
        return {
          position,
          text: [tagsText, comment].filter((part) => part !== undefined && part !== '').join(' '),
        };
      });
  }

  function postingText(posting, accountWidth, transactionDate) {
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
    if (posting.balanceQuantity !== null) {
      expression.push(`= ${amountText(posting.balanceQuantity, posting.balanceCommodity)}`);
    }
    const account = expression.length === 0
      ? posting.account
      : posting.account.padEnd(accountWidth);
    const line = `    ${account}${expression.length ? `  ${expression.join(' ')}` : ''}`;
    const metadata = metadataLines(posting);
    const inline = metadata.find(({ position }) => position === 0)?.text;
    const dateMarker = posting.postingDate === transactionDate
      ? null : `[${posting.postingDate}]`;
    const inlineText = [dateMarker, inline]
      .filter((part) => part !== null && part !== undefined && part !== '').join(' ');
    return [
      withComment(line, dateMarker === null && inline === undefined ? null : inlineText),
      ...metadata.filter(({ position }) => position !== 0)
        .map(({ text }) => `    ; ${text}`),
    ];
  }

  function transactionText(entry) {
    const metadata = metadataLines(entry);
    const inline = metadata.find(({ position }) => position === 0)?.text ?? null;
    const lines = [withComment(`${entry.date} ${entry.description}`, inline)];
    lines.push(...metadata.filter(({ position }) => position !== 0)
      .map(({ text }) => `    ; ${text}`));
    const accountWidth = Math.max(0, ...entry.postings.map(({ account }) => account.length));
    for (const posting of entry.postings) {
      lines.push(...postingText(posting, accountWidth, entry.date));
    }
    return lines.join('\n');
  }

  function entryText(entry) {
    switch (entry.type) {
      case 'comment':
        return `; ${entry.text}`;
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
    const postings = new Map();
    const load = (type, sql, decorate) => {
      for (const row of database.prepare(sql).all()) {
        entries.set(row.entryId, { type, ...(decorate ? decorate(row) : row) });
      }
    };

    load('comment', 'SELECT entry_id AS entryId, text FROM file_comments');
    load('transaction', `
      SELECT entry_id AS entryId, date, description FROM transactions
    `, (row) => ({ ...row, postings: [], comments: [], tags: [] }));
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

    for (const row of database.prepare(`
      SELECT id AS postingId, transaction_id AS transactionId, posting_date AS postingDate,
        account, amount_quantity AS amountQuantity, amount_commodity AS amountCommodity,
        lot_cost_quantity AS lotCostQuantity, lot_cost_commodity AS lotCostCommodity,
        lot_cost_is_total AS lotCostIsTotal,
        cost_quantity AS costQuantity, cost_commodity AS costCommodity,
        cost_is_total AS costIsTotal,
        balance_quantity AS balanceQuantity, balance_commodity AS balanceCommodity
      FROM postings ORDER BY transaction_id, position
    `).all()) {
      const posting = { ...row, comments: [], tags: [] };
      entries.get(row.transactionId).postings.push(posting);
      postings.set(row.postingId, posting);
    }
    for (const row of database.prepare(`
      SELECT transaction_id AS transactionId, posting_id AS postingId, position, text
      FROM comments ORDER BY id
    `).all()) {
      const owner = row.postingId === null ? entries.get(row.transactionId) : postings.get(row.postingId);
      owner.comments.push({ position: row.position, text: row.text });
    }
    for (const row of database.prepare(`
      SELECT transaction_id AS transactionId, posting_id AS postingId,
        position, name, value
      FROM tags ORDER BY transaction_id, posting_id, position, ordinal
    `).all()) {
      const owner = row.postingId === null ? entries.get(row.transactionId) : postings.get(row.postingId);
      owner.tags.push({ position: row.position, name: row.name, value: row.value });
    }

    return `${ids.map((id) => entryText(entries.get(id))).join('\n\n')}\n`;
  }

  return { printJournal };
};
