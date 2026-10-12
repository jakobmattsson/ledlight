'use strict';

module.exports = ({
  fs,
  ingestionWarning: { createWarning, warningCodes },
  path,
  ohm,
  syntaxErrors: { syntaxError },
  topLevelBlocks: { splitTopLevelBlocks },
}: any) => {

  const grammarSource = fs.readFileSync(path.join(__dirname, '../../../src/modules/journal/ledger.ohm'), 'utf8');
  const grammar = ohm.grammar(grammarSource);

  function location(node: any, source: any) {
    const value = node.source.getLineAndColumn();
    return { source, line: value.lineNum, column: value.colNum };
  }

  function indentedLocation(indent: any, source: any) {
    const value = location(indent, source);
    return { ...value, column: value.column + indent.sourceString.length };
  }

  function optionalValue(node: any, source: any) {
    return node.children.length === 0 ? null : node.children[0].ast(source);
  }

  function values(node: any, source: any) {
    return node.children.map((child: any) => child.ast(source));
  }

  function comment(text: any, where: any) {
    return {
      text,
      key: null,
      value: null,
      location: where,
    };
  }

  function parsedComment(text: any, tags: any, where: any) {
    const binary = tags.length > 0 && tags[0].value === null;
    const remainingText = binary
      ? text.replace(/^:[^\s:;]+(?::[^\s:;]+)*:(?:[ \t]+)?/u, '').trim()
      : tags.length > 0 ? '' : text;
    const locatedTags = tags.map((tag: any) => {
      Object.defineProperty(tag, 'location', { value: where });
      return tag;
    });
    return {
      comment: tags.length > 0 && !remainingText ? null : comment(remainingText, where),
      tags: locatedTags,
    };
  }

  function parseDate(value: any, node: any, source: any) {
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
    document(entries: any, _end: any) {
      return {
        source: this.args.source,
        entries: values(entries, this.args.source).filter((entry: any) => entry !== null),
      };
    },

    topLevel_transaction(date: any, _space: any, description: any, inlineComment: any, _lineEnd: any, body: any) {
      const source = this.args.source;
      const text = description.sourceString.trim();
      const items = values(body, source).filter((item: any) => item !== null);
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

    posting(_indent: any, account: any, amountPart: any, _space: any, comment: any, _lineEnd: any) {
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
    amountPart(_separator: any, expression: any) { return optionalValue(expression, this.args.source); },

    balanceAssignment(_equals: any, _space: any, amount: any) {
      return { amount: null, lotCost: null, cost: null, balanceAssignment: amount.ast(this.args.source), balanceAssertion: null };
    },
    explicitAmount(amount: any, lotCost: any, cost: any, assertion: any) {
      return {
        amount: amount.ast(this.args.source),
        lotCost: optionalValue(lotCost, this.args.source),
        cost: optionalValue(cost, this.args.source),
        balanceAssignment: null,
        balanceAssertion: optionalValue(assertion, this.args.source),
      };
    },
    lotCost_total(_spaceBefore: any, _open: any, _spaceAfter: any, amount: any, _spaceBeforeClose: any, _close: any) {
      return { total: true, amount: amount.ast(this.args.source) };
    },
    lotCost_unit(_spaceBefore: any, _open: any, _spaceAfter: any, amount: any, _spaceBeforeClose: any, _close: any) {
      return { total: false, amount: amount.ast(this.args.source) };
    },
    cost(_spaceBefore: any, operator: any, _spaceAfter: any, amount: any) {
      return { total: operator.sourceString === '@@', amount: amount.ast(this.args.source) };
    },
    balanceAssertion(_spaceBefore: any, _equals: any, _spaceAfter: any, amount: any) { return amount.ast(this.args.source); },
    amount(number: any, _space: any, commodity: any) {
      return { quantity: number.ast(this.args.source), commodity: commodity.ast(this.args.source) };
    },
    number(_sign: any, _integer: any, _point: any, _fraction: any) { return this.sourceString; },
    commoditySymbol(_characters: any) { return this.sourceString; },

    topLevel_include(_keyword: any, _space: any, value: any, comment: any, _lineEnd: any) {
      return { type: 'include', path: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_account(_keyword: any, _space: any, value: any, comment: any, _lineEnd: any) {
      return { type: 'account', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_tag(_keyword: any, _space: any, value: any, comment: any, _lineEnd: any) {
      return { type: 'tag', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_commodity(_keyword: any, _space: any, symbol: any, comment: any, _trailingSpace: any, _lineEnd: any, body: any) {
      const source = this.args.source;
      const commodity = symbol.sourceString.trimEnd();
      const properties = values(body, source).filter((item: any) => item !== null);
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
        properties: properties.map(({ formatSymbol: _formatSymbol, ...property }: any) => property),
        location: location(this, source),
      };
    },
    commodityBody_format(_indent: any, _keyword: any, _space: any, quantity: any, _symbolSpace: any, symbol: any, comment: any, _trailingSpace: any, _lineEnd: any) {
      return {
        name: 'format',
        value: `${quantity.sourceString}${_symbolSpace.sourceString}${symbol.sourceString}`,
        formatSymbol: symbol.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    commodityBody_default(_indent: any, _keyword: any, comment: any, _lineEnd: any) {
      return {
        name: 'default',
        value: null,
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    topLevel_price(_keyword: any, _space1: any, date: any, _space2: any, commodity: any, _space3: any, price: any, _space4: any, comment: any, _lineEnd: any) {
      return {
        type: 'price',
        date: date.ast(this.args.source),
        commodity: commodity.ast(this.args.source),
        price: price.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: location(this, this.args.source),
      };
    },

    indentedComment(_indent: any, marker: any, _space: any, metadata: any, _lineEnd: any) {
      const tags = metadata.ast(this.args.source);
      const value = metadata.sourceString.trim();
      return {
        type: 'comment',
        ...parsedComment(value, tags, location(marker, this.args.source)),
      };
    },
    topLevel_comment(semicolon: any, _space: any, text: any, _lineEnd: any) {
      return {
        type: 'comment', text: text.sourceString.trim(),
        location: location(semicolon, this.args.source),
      };
    },
    postingInlineComment(_semicolon: any, _space: any, _open: any, date: any, _close: any, _dateSpace: any, metadata: any) {
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
    transactionInlineComment(_space1: any, _semicolon: any, _space2: any, metadata: any) {
      return parsedComment(this.sourceString.slice(this.sourceString.indexOf(';') + 1).trim(),
        metadata.ast(this.args.source), location(_semicolon, this.args.source));
    },
    inlineComment(_space1: any, _semicolon: any, _space2: any, text: any) { return text.sourceString.trim(); },
    metadataComment_tags(tags: any, _space: any, _text: any) { return tags.ast(this.args.source); },
    metadataComment_value(name: any, _colon: any, _space: any, text: any) {
      return [{ name: name.sourceString, value: text.sourceString.trim() }];
    },
    metadataComment_text(_text: any) { return []; },
    binaryTags(_open: any, _first: any, _separators: any, _names: any, _close: any) {
      return this.sourceString.slice(1, -1).split(':').map((name: any) => ({ name, value: null }));
    },
    topLevel_blank(_space: any, _newline: any) { return null; },

    date(_year1: any, _year2: any, _year3: any, _year4: any, _separator1: any, _month1: any, _month2: any, _separator2: any, _day1: any, _day2: any) {
      return parseDate(this.sourceString, this, this.args.source);
    },

    _iter(...children: any[]) { return children.map((child: any) => child.ast(this.args.source)); },
    _terminal() { return this.sourceString; },
  });

  function parseStrict(sourceText: any, options: any) {
    const source = options.source || '<input>';
    const result = grammar.match(sourceText, 'document');
    if (result.failed()) {
      const value = result.getInterval().getLineAndColumn();
      throw syntaxError(result.shortMessage, source, value.lineNum, value.colNum);
    }
    return semantics(result).ast(source);
  }

  function parse(sourceText: any, options: any) {
    const source = options.source || '<input>';
    const entries: any = [];
    const warnings: any = [];
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
