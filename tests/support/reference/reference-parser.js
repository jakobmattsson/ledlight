'use strict';

module.exports = ({
  fs,
  ingestionWarning: { createWarning, warningCodes },
  path,
  ohm,
  syntaxErrors: { syntaxError },
  topLevelBlocks: { splitTopLevelBlocks },
}) => {

  const grammarSource = fs.readFileSync(path.join(__dirname, '../../../src/surface/parser/ledger.ohm'), 'utf8');
  const grammar = ohm.grammar(grammarSource);

  function location(node, source) {
    const value = node.source.getLineAndColumn();
    return { source, line: value.lineNum, column: value.colNum };
  }

  function indentedLocation(indent, source) {
    const value = location(indent, source);
    return { ...value, column: value.column + indent.sourceString.length };
  }

  function optionalValue(node, source) {
    return node.children.length === 0 ? null : node.children[0].ast(source);
  }

  function values(node, source) {
    return node.children.map((child) => child.ast(source));
  }

  function parseDate(value, node, source) {
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
    document(entries, _end) {
      return {
        source: this.args.source,
        entries: values(entries, this.args.source).filter((entry) => entry !== null),
      };
    },

    topLevel_transaction(date, _space, description, comment, _lineEnd, body) {
      const source = this.args.source;
      const text = description.sourceString.trim();
      const items = values(body, source).filter((item) => item !== null);
      const postings = items.filter((item) => item.type === 'posting');
      const transactionComment = optionalValue(comment, source);
      const tags = [
        ...(transactionComment ? transactionComment.tags : []),
        ...items.filter((item) => item.type === 'note').flatMap((item) => item.tags || []),
      ];
      const transaction = {
        type: 'transaction',
        date: date.ast(source),
        description: text,
        comment: transactionComment ? transactionComment.comment : null,
        location: location(date, source),
      };
      if (postings.length === 0) {
        throw syntaxError('Transaction has no postings', source, transaction.location.line, transaction.location.column);
      }
      return {
        ...transaction,
        ...(tags.length > 0 ? { tags } : {}),
        postings,
        notes: items.filter((item) => item.type === 'note').map(({ type: _type, ...note }) => note),
      };
    },

    posting(_indent, account, amountPart, _space, comment, _lineEnd) {
      const expression = optionalValue(amountPart, this.args.source) || {
        amount: null,
        lotCost: null,
        cost: null,
        balanceAssignment: null,
        balanceAssertion: null,
      };
      const postingComment = optionalValue(comment, this.args.source);
      return {
        type: 'posting',
        account: account.sourceString.trim(),
        ...expression,
        postingDate: postingComment ? postingComment.date : null,
        comment: postingComment ? postingComment.comment : null,
        ...(postingComment && postingComment.tags.length > 0 ? { tags: postingComment.tags } : {}),
        location: location(account, this.args.source),
      };
    },
    amountPart(_separator, expression) { return optionalValue(expression, this.args.source); },

    balanceAssignment(_equals, _space, amount) {
      return { amount: null, lotCost: null, cost: null, balanceAssignment: amount.ast(this.args.source), balanceAssertion: null };
    },
    explicitAmount(amount, lotCost, cost, assertion) {
      return {
        amount: amount.ast(this.args.source),
        lotCost: optionalValue(lotCost, this.args.source),
        cost: optionalValue(cost, this.args.source),
        balanceAssignment: null,
        balanceAssertion: optionalValue(assertion, this.args.source),
      };
    },
    lotCost_total(_spaceBefore, _open, _spaceAfter, amount, _spaceBeforeClose, _close) {
      return { total: true, amount: amount.ast(this.args.source) };
    },
    lotCost_unit(_spaceBefore, _open, _spaceAfter, amount, _spaceBeforeClose, _close) {
      return { total: false, amount: amount.ast(this.args.source) };
    },
    cost(_spaceBefore, operator, _spaceAfter, amount) {
      return { total: operator.sourceString === '@@', amount: amount.ast(this.args.source) };
    },
    balanceAssertion(_spaceBefore, _equals, _spaceAfter, amount) { return amount.ast(this.args.source); },
    amount(number, _space, commodity) {
      return { quantity: number.ast(this.args.source), commodity: commodity.ast(this.args.source) };
    },
    number(_sign, _integer, _point, _fraction) { return this.sourceString; },
    commoditySymbol(_characters) { return this.sourceString; },

    topLevel_include(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'include', path: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_account(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'account', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_tag(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'tag', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    topLevel_commodity(_keyword, _space, symbol, comment, _trailingSpace, _lineEnd, body) {
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
    commodityBody_format(_indent, _keyword, _space, quantity, _symbolSpace, symbol, comment, _trailingSpace, _lineEnd) {
      return {
        name: 'format',
        value: `${quantity.sourceString}${_symbolSpace.sourceString}${symbol.sourceString}`,
        formatSymbol: symbol.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    commodityBody_default(_indent, _keyword, comment, _lineEnd) {
      return {
        name: 'default',
        value: null,
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    topLevel_price(_keyword, _space1, date, _space2, commodity, _space3, price, _space4, comment, _lineEnd) {
      return {
        type: 'price',
        date: date.ast(this.args.source),
        commodity: commodity.ast(this.args.source),
        price: price.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: location(this, this.args.source),
      };
    },

    indentedComment(_indent, marker, _space, metadata, _lineEnd) {
      const tags = metadata.ast(this.args.source);
      const value = metadata.sourceString.trim();
      const valueTag = tags.length === 1 && tags[0].value !== null ? tags[0] : null;
      return {
        type: 'note',
        text: value,
        key: valueTag ? valueTag.name : null,
        value: valueTag ? valueTag.value : null,
        ...(tags.length > 0 ? { tags } : {}),
        location: location(marker, this.args.source),
      };
    },
    topLevel_comment(_semicolon, _space, _text, _lineEnd) { return null; },
    postingComment(_semicolon, _space, _open, date, _close, _dateSpace, metadata) {
      return {
        date: optionalValue(date, this.args.source),
        comment: this.sourceString.slice(this.sourceString.indexOf(';') + 1).trim(),
        tags: metadata.ast(this.args.source),
      };
    },
    transactionComment(_space1, _semicolon, _space2, metadata) {
      return {
        comment: this.sourceString.slice(this.sourceString.indexOf(';') + 1).trim(),
        tags: metadata.ast(this.args.source),
      };
    },
    inlineComment(_space1, _semicolon, _space2, text) { return text.sourceString.trim(); },
    metadataComment_tags(tags, _space, _text) { return tags.ast(this.args.source); },
    metadataComment_value(name, _colon, _space, text) {
      return [{ name: name.sourceString, value: text.sourceString.trim() }];
    },
    metadataComment_text(_text) { return []; },
    binaryTags(_open, _first, _separators, _names, _close) {
      return this.sourceString.slice(1, -1).split(':').map((name) => ({ name, value: null }));
    },
    topLevel_blank(_space, _newline) { return null; },

    date(_year1, _year2, _year3, _year4, _separator1, _month1, _month2, _separator2, _day1, _day2) {
      return parseDate(this.sourceString, this, this.args.source);
    },

    _iter(...children) { return children.map((child) => child.ast(this.args.source)); },
    _terminal() { return this.sourceString; },
  });

  function parseStrict(sourceText, options) {
    const source = options.source || '<input>';
    const result = grammar.match(sourceText, 'document');
    if (result.failed()) {
      const value = result.getInterval().getLineAndColumn();
      throw syntaxError(result.shortMessage, source, value.lineNum, value.colNum);
    }
    return semantics(result).ast(source);
  }

  function parse(sourceText, options) {
    const source = options.source || '<input>';
    const entries = [];
    const warnings = [];
    for (const block of splitTopLevelBlocks(sourceText)) {
      try {
        const padding = '\n'.repeat(block.startLine - 1);
        entries.push(...parseStrict(`${padding}${block.sourceText}`, { source }).entries);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
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

  return { $$private: { parse, parseStrict } };
};
