'use strict';

import type { Node } from 'ohm-js' with { 'resolution-mode': 'import' };

module.exports = ({
  fs,
  ingestionWarning: { createWarning, warningCodes },
  path,
  ohm,
  syntaxErrors: { syntaxError },
  topLevelBlocks: { splitTopLevelBlocks },
}: any) => {

  const grammarSource = fs.readFileSync(path.join(__dirname, '../../../src/modules/interfaces/journal/ledger.ohm'), 'utf8');
  const grammar = ohm.grammar(grammarSource);

  function location(node: Node, source: string) {
    const value = node.source.getLineAndColumn();
    return { source, line: value.lineNum, column: value.colNum };
  }

  function indentedLocation(indent: Node, source: string) {
    const value = location(indent, source);
    return { ...value, column: value.column + indent.sourceString.length };
  }

  function optionalValue(node: Node, source: string) {
    return node.children.length === 0 ? null : node.children[0].ast(source);
  }

  function values(node: Node, source: string) {
    return node.children.map((child: Node) => child.ast(source));
  }

  function comment(text: string, where: { source: string; line: number; column: number }) {
    return {
      text,
      key: null,
      value: null,
      location: where,
    };
  }

  function parsedComment(text: string, tags: Array<{ name: string; value: string | null }>, where: { source: string; line: number; column: number }) {
    const binary = tags.length > 0 && tags[0].value === null;
    const remainingText = binary
      ? text.replace(/^:[^\s:;]+(?::[^\s:;]+)*:(?:[ \t]+)?/u, '').trim()
      : tags.length > 0 ? '' : text;
    const locatedTags = tags.map((tag) => {
      Object.defineProperty(tag, 'location', { value: where });
      return tag;
    });
    return {
      comment: tags.length > 0 && !remainingText ? null : comment(remainingText, where),
      tags: locatedTags,
    };
  }

  function parseDate(value: string, node: Node, source: string) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      const where = location(node, source);
      throw syntaxError(`Invalid date ${JSON.stringify(value)}`, source, where.line, where.column);
    }
    return value;
  }

  const semantics = grammar.createSemantics().addOperation('ast(source)', {
    document(entries: Node, _end: Node) {
      return {
        source: this.args.source,
        entries: values(entries, this.args.source).filter((entry) => entry !== null),
      };
    },

    topLevel_transaction(date: Node, _space: Node, description: Node, inlineComment: Node, _lineEnd: Node, body: Node) {
      const source = this.args.source;
      const text = description.sourceString.trim();
      const items = values(body, source).filter((item) => item !== null);
      const headerComment = optionalValue(inlineComment, source);
      const transaction: any = {
        type: 'transaction',
        date: date.ast(source),
        description: text,
        postings: [],
        comments: headerComment?.comment ? [headerComment.comment] : [],
        location: location(date, source),
      };
      if (headerComment?.tags.length > 0) transaction.tags = [...headerComment.tags];
      for (const item of items) {
        if (item.type === 'posting') {
          transaction.postings.push(item);
        } else {
          const owner = transaction.postings.at(-1) || transaction;
          if (item.comment) owner.comments.push(item.comment);
          if (item.tags.length > 0) owner.tags = [...(owner.tags || []), ...item.tags];
        }
      }
      if (transaction.postings.length === 0) {
        throw syntaxError('Transaction has no postings', source, transaction.location.line, transaction.location.column);
      }
      return transaction;
    },

    posting(_indent: Node, account: Node, amountPart: Node, _space: Node, comment: Node, _lineEnd: Node) {
      const expression = optionalValue(amountPart, this.args.source) || {
        amount: null,
        lotCost: null,
        cost: null,
        balanceAssignment: null,
        balanceAssertion: null,
      };
      const inlineComment = optionalValue(comment, this.args.source);
      return {
        type: 'posting',
        account: account.sourceString.trim(),
        ...expression,
        postingDate: inlineComment ? inlineComment.date : null,
        comments: inlineComment?.comment ? [inlineComment.comment] : [],
        ...(inlineComment?.tags.length > 0 ? { tags: inlineComment.tags } : {}),
        location: location(account, this.args.source),
      };
    },
    amountPart(_separator: Node, expression: Node) { return optionalValue(expression, this.args.source); },

    balanceAssignment(_equals: Node, _space: Node, amount: Node) {
      return { amount: null, lotCost: null, cost: null, balanceAssignment: amount.ast(this.args.source), balanceAssertion: null };
    },
    explicitAmount(amount: Node, lotCost: Node, cost: Node, assertion: Node) {
      return {
        amount: amount.ast(this.args.source),
        lotCost: optionalValue(lotCost, this.args.source),
        cost: optionalValue(cost, this.args.source),
        balanceAssignment: null,
        balanceAssertion: optionalValue(assertion, this.args.source),
      };
    },
    lotCost_total(_spaceBefore: Node, _open: Node, _spaceAfter: Node, amount: Node, _spaceBeforeClose: Node, _close: Node) {
      return { total: true, amount: amount.ast(this.args.source) };
    },
    lotCost_unit(_spaceBefore: Node, _open: Node, _spaceAfter: Node, amount: Node, _spaceBeforeClose: Node, _close: Node) {
      return { total: false, amount: amount.ast(this.args.source) };
    },
    cost(_spaceBefore: Node, operator: Node, _spaceAfter: Node, amount: Node) {
      return { total: operator.sourceString === '@@', amount: amount.ast(this.args.source) };
    },
    balanceAssertion(_spaceBefore: Node, _equals: Node, _spaceAfter: Node, amount: Node) { return amount.ast(this.args.source); },
    amount(number: Node, _space: Node, commodity: Node) {
      return { quantity: number.ast(this.args.source), commodity: commodity.ast(this.args.source) };
    },
    number(_sign: Node, _integer: Node, _point: Node, _fraction: Node) { return this.sourceString; },
    commoditySymbol(_characters: Node) { return this.sourceString; },

    topLevel_include(_keyword: Node, _space: Node, value: Node, comment: Node, _lineEnd: Node) {
      return { type: 'include', path: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_account(_keyword: Node, _space: Node, value: Node, comment: Node, _lineEnd: Node) {
      return { type: 'account', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_tag(_keyword: Node, _space: Node, value: Node, comment: Node, _lineEnd: Node) {
      return { type: 'tag', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_commodity(_keyword: Node, _space: Node, symbol: Node, comment: Node, _trailingSpace: Node, _lineEnd: Node, body: Node) {
      const source = this.args.source;
      const commodity = symbol.sourceString.trimEnd();
      const properties = values(body, source).filter((item) => item !== null);
      for (const property of properties) {
        if (property.formatSymbol && property.formatSymbol !== commodity) {
          const where = property.location;
          throw syntaxError(`Commodity format symbol ${JSON.stringify(property.formatSymbol)} must match ${JSON.stringify(commodity)}`, source, where.line, where.column);
        }
      }
      return {
        type: 'commodity',
        symbol: commodity,
        comment: optionalValue(comment, source),
        properties: properties.map(({ formatSymbol: _formatSymbol, ...property }) => property),
        location: location(this, source),
      };
    },
    commodityBody_format(_indent: Node, _keyword: Node, _space: Node, quantity: Node, _symbolSpace: Node, symbol: Node, comment: Node, _trailingSpace: Node, _lineEnd: Node) {
      return {
        name: 'format',
        value: `${quantity.sourceString}${_symbolSpace.sourceString}${symbol.sourceString}`,
        formatSymbol: symbol.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    commodityBody_default(_indent: Node, _keyword: Node, comment: Node, _lineEnd: Node) {
      return {
        name: 'default',
        value: null,
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    topLevel_price(_keyword: Node, _space1: Node, date: Node, _space2: Node, commodity: Node, _space3: Node, price: Node, _space4: Node, comment: Node, _lineEnd: Node) {
      return {
        type: 'price',
        date: date.ast(this.args.source),
        commodity: commodity.ast(this.args.source),
        price: price.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: location(this, this.args.source),
      };
    },

    indentedComment(_indent: Node, marker: Node, _space: Node, metadata: Node, _lineEnd: Node) {
      const tags = metadata.ast(this.args.source);
      const value = metadata.sourceString.trim();
      return {
        type: 'comment',
        ...parsedComment(value, tags, location(marker, this.args.source)),
      };
    },
    topLevel_comment(semicolon: Node, _space: Node, text: Node, _lineEnd: Node) {
      return {
        type: 'comment', text: text.sourceString.trim(),
        location: location(semicolon, this.args.source),
      };
    },
    postingInlineComment(_semicolon: Node, _space: Node, _open: Node, date: Node, _close: Node, _dateSpace: Node, metadata: Node) {
      const tags = metadata.ast(this.args.source);
      const postingDate = optionalValue(date, this.args.source);
      const text = metadata.sourceString.trim();
      return {
        date: postingDate,
        ...(postingDate && !text
          ? { comment: null, tags: [] }
          : parsedComment(text, tags, location(_semicolon, this.args.source))),
      };
    },
    transactionInlineComment(_space1: Node, _semicolon: Node, _space2: Node, metadata: Node) {
      return parsedComment(this.sourceString.slice(this.sourceString.indexOf(';') + 1).trim(),
        metadata.ast(this.args.source), location(_semicolon, this.args.source));
    },
    inlineComment(_space1: Node, _semicolon: Node, _space2: Node, text: Node) { return text.sourceString.trim(); },
    metadataComment_tags(tags: Node, _space: Node, _text: Node) { return tags.ast(this.args.source); },
    metadataComment_value(name: Node, _colon: Node, _space: Node, text: Node) {
      return [{ name: name.sourceString, value: text.sourceString.trim() }];
    },
    metadataComment_text(_text: Node) { return []; },
    binaryTags(_open: Node, _first: Node, _separators: Node, _names: Node, _close: Node) {
      return this.sourceString.slice(1, -1).split(':').map((name: string) => ({ name, value: null }));
    },
    topLevel_blank(_space: Node, _newline: Node) { return null; },

    date(_year1: Node, _year2: Node, _year3: Node, _year4: Node, _separator1: Node, _month1: Node, _month2: Node, _separator2: Node, _day1: Node, _day2: Node) {
      return parseDate(this.sourceString, this, this.args.source);
    },

    _iter(...children: Node[]) { return children.map((child: Node) => child.ast(this.args.source)); },
    _terminal() { return this.sourceString; },
  });

  function parseStrict(sourceText: string, options: any) {
    const source = options.source || '<input>';
    const result = grammar.match(sourceText, 'document');
    if (result.failed()) {
      const value = result.getInterval().getLineAndColumn();
      throw syntaxError(result.shortMessage, source, value.lineNum, value.colNum);
    }
    return semantics(result).ast(source);
  }

  function parse(sourceText: string, options: any) {
    const source = options.source || '<input>';
    const entries = [];
    const warnings = [];
    for (const block of splitTopLevelBlocks(sourceText)) {
      try {
        const padding = '\n'.repeat(block.startLine - 1);
        entries.push(...parseStrict(`${padding}${block.sourceText}`, { source }).entries);
      } catch (error: any) {
        if (!(error instanceof SyntaxError)) throw error;
        warnings.push(createWarning(
          warningCodes.SYNTAX_ERROR,
          (error as any).detail || error.message,
          {
            source,
            line: (error as any).line,
            column: (error as any).column,
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

  return { $$private: { parse, parseStrict } };
};
