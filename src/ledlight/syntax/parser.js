'use strict';

module.exports = ({
  amountParser: { parseAmountExpression },
  syntaxErrors: { syntaxError },
}) => {

  const DATE_LENGTH = 10;
  const COMMODITY_PROPERTY_NAMES = new Set(['default', 'format', 'nomarket']);
  const isWhitespace = (code) => code === 32 || code === 9;
  const sourceLocation = (source, line, column) => ({ source, line, column });

  function isDateAt(input, offset) {
    if (input.length - offset < DATE_LENGTH) return false;
    for (let index = 0; index < DATE_LENGTH; index++) {
      const code = input.charCodeAt(offset + index);
      if (index === 4 || index === 7) {
        if (code !== 45 && code !== 47) return false;
      } else if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function assertDate(value, source, line, column) {
    const normalized = value.replaceAll('/', '-');
    const year = Number(normalized.slice(0, 4));
    const month = Number(normalized.slice(5, 7));
    const day = Number(normalized.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw syntaxError(`Invalid date ${JSON.stringify(value)}`, source, line, column);
    }
    return normalized;
  }

  function splitComment(input) {
    let quote = 0;
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      if (quote) {
        if (code === quote) quote = 0;
      } else if (code === 34 || code === 39) quote = code;
      else if (code === 59) return { text: input.slice(0, index).trimEnd(), comment: input.slice(index + 1).trim() };
    }
    return { text: input.trimEnd(), comment: null };
  }

  function findFieldSeparator(input) {
    for (let index = 0; index < input.length; index++) {
      const code = input.charCodeAt(index);
      if (code === 9) return { start: index, end: index + 1 };
      if (code === 32 && input.charCodeAt(index + 1) === 32) {
        let end = index + 2;
        while (isWhitespace(input.charCodeAt(end))) end++;
        return { start: index, end };
      }
    }
    return null;
  }

  function parseTransactionHeader(text, source, line) {
    let cursor = DATE_LENGTH;
    const date = assertDate(text.slice(0, cursor), source, line, 1);
    if (cursor < text.length && !isWhitespace(text.charCodeAt(cursor))) {
      throw syntaxError('Expected whitespace after transaction date', source, line, cursor + 1);
    }
    while (isWhitespace(text.charCodeAt(cursor))) cursor++;

    let status = null;
    if (text[cursor] === '*' || text[cursor] === '!') {
      status = text[cursor++];
      while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    }
    let code = null;
    if (text[cursor] === '(') {
      const end = text.indexOf(')', cursor + 1);
      if (end < 0) throw syntaxError('Unterminated transaction code', source, line, cursor + 1);
      code = text.slice(cursor + 1, end);
      cursor = end + 1;
      while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    }
    const parts = splitComment(text.slice(cursor));
    const pipe = parts.text.indexOf('|');
    const description = parts.text.trim();
    return {
      type: 'transaction', date, status, code, description,
      payee: pipe < 0 ? null : parts.text.slice(0, pipe).trim(),
      narration: pipe < 0 ? description : parts.text.slice(pipe + 1).trim(),
      comment: parts.comment, postings: [], notes: [], location: sourceLocation(source, line, 1),
    };
  }

  function parsePosting(raw, source, line) {
    let indent = 0;
    while (isWhitespace(raw.charCodeAt(indent))) indent++;
    const parts = splitComment(raw.slice(indent));
    const separator = findFieldSeparator(parts.text);
    const account = (separator ? parts.text.slice(0, separator.start) : parts.text).trim();
    if (!account) throw syntaxError('Posting account cannot be empty', source, line, indent + 1);
    const expressionText = separator ? parts.text.slice(separator.end).trim() : '';
    const expressionColumn = separator ? indent + separator.end + 1 : raw.length + 1;
    const expression = parseAmountExpression(expressionText, sourceLocation(source, line, expressionColumn));
    const postingDateMatch = parts.comment && /^\[(\d{4}[-/]\d{2}[-/]\d{2})\](?:\s|$)/u.exec(parts.comment);
    return {
      type: 'posting', account,
      ...(expression || { amount: null, cost: null, balanceAssignment: null, balanceAssertion: null }),
      postingDate: postingDateMatch ? assertDate(postingDateMatch[1], source, line, raw.indexOf('[') + 2) : null,
      comment: parts.comment, location: sourceLocation(source, line, indent + 1),
    };
  }

  function parsePrice(text, source, line) {
    let cursor = 1;
    while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    if (!isDateAt(text, cursor)) throw syntaxError('Expected a date after P', source, line, cursor + 1);
    const date = assertDate(text.slice(cursor, cursor + DATE_LENGTH), source, line, cursor + 1);
    cursor += DATE_LENGTH;
    while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    const symbolStart = cursor;
    while (cursor < text.length && !isWhitespace(text.charCodeAt(cursor))) cursor++;
    const commodity = text.slice(symbolStart, cursor);
    if (!commodity) throw syntaxError('Expected a commodity in price directive', source, line, symbolStart + 1);
    while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    const parts = splitComment(text.slice(cursor));
    const expression = parseAmountExpression(parts.text, sourceLocation(source, line, cursor + 1));
    if (!expression || !expression.amount || expression.cost || expression.balanceAssignment || expression.balanceAssertion) {
      throw syntaxError('Expected a simple amount in price directive', source, line, cursor + 1);
    }
    return { type: 'price', date, commodity, price: expression.amount, comment: parts.comment, location: sourceLocation(source, line, 1) };
  }

  function parseNamedDirective(text, keyword, type, source, line) {
    const value = splitComment(text.slice(keyword.length).trimStart());
    if (!value.text) throw syntaxError(`Expected a value after ${keyword}`, source, line, keyword.length + 1);
    return { type, name: value.text, comment: value.comment, location: sourceLocation(source, line, 1) };
  }

  /** Fast runtime parser. Its behavior is checked against ledger.ohm. */
  function parse(sourceText, options) {
    const source = options.source || '<input>';
    const entries = [];
    let transaction = null;
    let commodity = null;
    let lineNumber = 0;
    let start = 0;

    for (let end = 0; end <= sourceText.length; end++) {
      if (end < sourceText.length && sourceText.charCodeAt(end) !== 10) continue;
      lineNumber++;
      let raw = sourceText.slice(start, end);
      if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
      start = end + 1;
      let first = 0;
      while (isWhitespace(raw.charCodeAt(first))) first++;
      const trimmed = raw.slice(first);
      if (!trimmed) continue;

      const marker = trimmed[0];
      if (marker === ';' || marker === '#' || marker === '%') {
        if (transaction && first > 0) {
          const text = trimmed.slice(1).trim();
          const colon = text.indexOf(':');
          transaction.notes.push({
            text,
            key: colon < 1 ? null : text.slice(0, colon).trim(),
            value: colon < 1 ? null : text.slice(colon + 1).trim(),
            location: sourceLocation(source, lineNumber, first + 1),
          });
        }
        continue;
      }
      if (first === 0 && marker === ':') continue;
      if (first > 0) {
        if (transaction) transaction.postings.push(parsePosting(raw, source, lineNumber));
        else if (commodity) {
          const property = splitComment(trimmed);
          const separator = property.text.search(/[ \t]/);
          const name = separator < 0 ? property.text : property.text.slice(0, separator);
          if (!COMMODITY_PROPERTY_NAMES.has(name)) {
            throw syntaxError(
              `Unsupported commodity property ${JSON.stringify(name)}`,
              source,
              lineNumber,
              first + 1,
            );
          }
          const value = separator < 0 ? null : property.text.slice(separator).trim();
          commodity.properties.push({ name, value, comment: property.comment, location: sourceLocation(source, lineNumber, first + 1) });
        } else throw syntaxError('Unexpected indented line', source, lineNumber, first + 1);
        continue;
      }

      transaction = null;
      commodity = null;
      if (isDateAt(trimmed, 0)) {
        transaction = parseTransactionHeader(trimmed, source, lineNumber);
        entries.push(transaction);
      } else if (trimmed.startsWith('include') && isWhitespace(trimmed.charCodeAt(7))) {
        const include = parseNamedDirective(trimmed, 'include', 'include', source, lineNumber);
        include.path = include.name;
        delete include.name;
        entries.push(include);
      } else if (trimmed.startsWith('account') && isWhitespace(trimmed.charCodeAt(7))) entries.push(parseNamedDirective(trimmed, 'account', 'account', source, lineNumber));
      else if (trimmed.startsWith('tag') && isWhitespace(trimmed.charCodeAt(3))) entries.push(parseNamedDirective(trimmed, 'tag', 'tag', source, lineNumber));
      else if (trimmed.startsWith('commodity') && isWhitespace(trimmed.charCodeAt(9))) {
        commodity = parseNamedDirective(trimmed, 'commodity', 'commodity', source, lineNumber);
        commodity.symbol = commodity.name;
        delete commodity.name;
        commodity.properties = [];
        entries.push(commodity);
      } else if (marker === 'P' && isWhitespace(trimmed.charCodeAt(1))) entries.push(parsePrice(trimmed, source, lineNumber));
      else {
        const keyword = trimmed.split(/[ \t]/, 1)[0];
        throw syntaxError(`Unsupported directive or transaction header ${JSON.stringify(keyword)}`, source, lineNumber, 1);
      }
    }

    for (const entry of entries) {
      if (entry.type === 'transaction' && entry.postings.length === 0) {
        throw syntaxError('Transaction has no postings', source, entry.location.line, 1);
      }
    }
    return { source, entries };
  }

  return { parse };
};
