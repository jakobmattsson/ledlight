'use strict';

module.exports = ({
  amountParser: { parseAmountExpression },
  ingestionWarning: { createWarning, warningCodes },
  syntaxErrors: { syntaxError },
  topLevelBlocks: { splitTopLevelBlocks },
  publicErrors: { createError, errorCodes },
  zod: { z },
}) => {

  const DATE_LENGTH = 10;
  const COMMODITY_PROPERTY_NAMES = new Set(['default', 'format']);
  const CANONICAL_COMMODITY_FORMAT = /^(\d,?\d{3})(?:\.(\d+))?[ \t]+([^ \t]+)$/u;
  const isWhitespace = (code) => code === 32 || code === 9;
  const isCommodityCharacter = (code) => !isWhitespace(code) && code !== 10 && code !== 13 &&
    code !== 34 && code !== 39 && code !== 59 && code !== 61 && code !== 64 &&
    code !== 123 && code !== 125;
  const sourceLocation = (source, line, column) => ({ source, line, column });
  const optionsSchema = z.strictObject({ source: z.string().optional() });

  function assertCommoditySymbol(value, source, line, column) {
    if (!value || [...value].some((character) => !isCommodityCharacter(character.codePointAt(0)))) {
      throw syntaxError(`Invalid commodity symbol ${JSON.stringify(value)}`, source, line, column);
    }
    return value;
  }

  function isDateAt(input, offset) {
    if (input.length - offset < DATE_LENGTH) return false;
    for (let index = 0; index < DATE_LENGTH; index++) {
      const code = input.charCodeAt(offset + index);
      if (index === 4 || index === 7) {
        if (code !== 45) return false;
      } else if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function assertDate(value, source, line, column) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw syntaxError(`Invalid date ${JSON.stringify(value)}`, source, line, column);
    }
    return value;
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

  function parseCommentTags(comment) {
    if (comment === null) return [];
    const binary = /^:([^\s:;]+(?::[^\s:;]+)*:)(?:[ \t]+.*)?$/u.exec(comment);
    if (binary) return binary[1].slice(0, -1).split(':').map((name) => ({ name, value: null }));
    const value = /^([^\s:;]+):[ \t]+(.*)$/u.exec(comment);
    return value ? [{ name: value[1], value: value[2].trim() }] : [];
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

    const parts = splitComment(text.slice(cursor));
    const description = parts.text.trim();
    if (!description) throw syntaxError('Expected a transaction description', source, line, cursor + 1);
    const tags = parseCommentTags(parts.comment);
    return {
      type: 'transaction', date, description,
      comment: parts.comment, ...(tags.length > 0 ? { tags } : {}), postings: [], notes: [], location: sourceLocation(source, line, 1),
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
    const postingDateMatch = parts.comment && /^\[(\d{4}-\d{2}-\d{2})\](?:\s|$)/u.exec(parts.comment);
    const commentAfterDate = postingDateMatch ? parts.comment.slice(postingDateMatch[0].length).trimStart() : parts.comment;
    const tags = parseCommentTags(commentAfterDate);
    return {
      type: 'posting', account,
      ...(expression || { amount: null, lotCost: null, cost: null, balanceAssignment: null, balanceAssertion: null }),
      postingDate: postingDateMatch ? assertDate(postingDateMatch[1], source, line, raw.indexOf('[') + 2) : null,
      comment: parts.comment, ...(tags.length > 0 ? { tags } : {}), location: sourceLocation(source, line, indent + 1),
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
    const commodity = assertCommoditySymbol(text.slice(symbolStart, cursor), source, line, symbolStart + 1);
    while (isWhitespace(text.charCodeAt(cursor))) cursor++;
    const parts = splitComment(text.slice(cursor));
    const expression = parseAmountExpression(parts.text, sourceLocation(source, line, cursor + 1));
    if (!expression || !expression.amount || expression.lotCost || expression.cost ||
        expression.balanceAssignment || expression.balanceAssertion) {
      throw syntaxError('Expected a simple amount in price directive', source, line, cursor + 1);
    }
    return { type: 'price', date, commodity, price: expression.amount, comment: parts.comment, location: sourceLocation(source, line, 1) };
  }

  function parseNamedDirective(text, keyword, type, source, line) {
    const value = splitComment(text.slice(keyword.length).trimStart());
    if (!value.text) throw syntaxError(`Expected a value after ${keyword}`, source, line, keyword.length + 1);
    return { type, name: value.text, comment: value.comment, location: sourceLocation(source, line, 1) };
  }

  function assertCommodityFormat(value, commodity, source, line, column) {
    const match = CANONICAL_COMMODITY_FORMAT.exec(value);
    if (!match) throw syntaxError('Expected a canonical commodity format', source, line, column);
    const symbol = assertCommoditySymbol(match[3], source, line, column);
    if (symbol !== commodity) {
      throw syntaxError(`Commodity format symbol ${JSON.stringify(symbol)} must match ${JSON.stringify(commodity)}`, source, line, column);
    }
  }

  /** Fast runtime parser. Its behavior is checked against ledger.ohm. */
  function parseStrict(sourceText, options, lineOffset) {
    if (typeof sourceText !== 'string') {
      throw createError(errorCodes.INVALID_API_INPUT, 'Ledger source text must be a string', TypeError);
    }
    const result = optionsSchema.safeParse(options ?? {});
    if (!result.success) {
      throw createError(
        errorCodes.INVALID_API_INPUT,
        `Invalid parse options: ${result.error.issues[0].message}`,
        TypeError,
      );
    }
    const source = result.data.source || '<input>';
    const entries = [];
    let transaction = null;
    let commodity = null;
    let lineNumber = lineOffset || 0;
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
      if (!trimmed) {
        transaction = null;
        commodity = null;
        continue;
      }

      const marker = trimmed[0];
      if (marker === ';') {
        if (transaction && first > 0) {
          const text = trimmed.slice(1).trim();
          const tags = parseCommentTags(text);
          const valueTag = tags.length === 1 && tags[0].value !== null ? tags[0] : null;
          transaction.notes.push({
            text,
            key: valueTag ? valueTag.name : null,
            value: valueTag ? valueTag.value : null,
            ...(tags.length > 0 ? { tags } : {}),
            location: sourceLocation(source, lineNumber, first + 1),
          });
          if (tags.length > 0) transaction.tags = [...(transaction.tags || []), ...tags];
        }
        if (first === 0 || transaction) continue;
      }
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
          if (name === 'format') assertCommodityFormat(value, commodity.symbol, source, lineNumber, first + 1);
          if (name === 'default' && value !== null) {
            throw syntaxError('Default commodity property does not accept a value', source, lineNumber, first + 1);
          }
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
        commodity.symbol = assertCommoditySymbol(commodity.name, source, lineNumber, 11);
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

  function parse(sourceText, options) {
    const result = optionsSchema.safeParse(options ?? {});
    if (!result.success) {
      throw createError(
        errorCodes.INVALID_API_INPUT,
        `Invalid parse options: ${result.error.issues[0].message}`,
        TypeError,
      );
    }
    const source = result.data.source || '<input>';
    const entries = [];
    const warnings = [];
    for (const block of splitTopLevelBlocks(sourceText)) {
      try {
        entries.push(...parseStrict(
          block.sourceText,
          { source },
          block.startLine - 1,
        ).entries);
      } catch (error) {
        if (error.code !== errorCodes.SYNTAX) throw error;
        warnings.push(createWarning(
          warningCodes.SYNTAX_ERROR,
          error.detail || error.message,
          {
            source,
            line: error.line,
            column: error.column,
            startLine: block.startLine,
            endLine: block.endLine,
          },
        ));
      }
    }
    return {
      source,
      entries,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  return { parse, parseStrict, $$private: { parseStrict } };
};
