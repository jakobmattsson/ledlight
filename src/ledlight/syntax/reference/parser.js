'use strict';

module.exports = ({
  fs,
  path,
  ohm,
  syntaxErrors: { syntaxError },
}) => {

  const grammarSource = fs.readFileSync(path.join(__dirname, 'ledger.ohm'), 'utf8');
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

    transaction(header, body) {
      const source = this.args.source;
      const value = header.ast(source);
      const items = values(body, source).filter((item) => item !== null);
      const postings = items.filter((item) => item.type === 'posting');
      if (postings.length === 0) {
        throw syntaxError('Transaction has no postings', source, value.location.line, value.location.column);
      }
      return {
        ...value,
        postings,
        notes: items.filter((item) => item.type === 'note').map(({ type: _type, ...note }) => note),
      };
    },

    transactionHeader(date, _space, description, comment, _lineEnd) {
      const source = this.args.source;
      const text = description.sourceString.trim();
      const pipe = text.indexOf('|');
      return {
        type: 'transaction',
        date: date.ast(source),
        status: null,
        code: null,
        description: text,
        payee: pipe < 0 ? null : text.slice(0, pipe).trim(),
        narration: pipe < 0 ? text : text.slice(pipe + 1).trim(),
        comment: optionalValue(comment, source),
        location: location(date, source),
      };
    },

    posting(_indent, account, amountPart, _space, comment, _lineEnd) {
      const expression = optionalValue(amountPart, this.args.source) || {
        amount: null,
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
        location: location(account, this.args.source),
      };
    },
    amountPart(_separator, expression) { return optionalValue(expression, this.args.source); },

    balanceAssignment(_equals, _space, amount) {
      return { amount: null, cost: null, balanceAssignment: amount.ast(this.args.source), balanceAssertion: null };
    },
    explicitAmount(amount, cost, assertion) {
      return {
        amount: amount.ast(this.args.source),
        cost: optionalValue(cost, this.args.source),
        balanceAssignment: null,
        balanceAssertion: optionalValue(assertion, this.args.source),
      };
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

    includeDirective(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'include', path: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    accountDirective(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'account', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    tagDirective(_keyword, _space, value, comment, _lineEnd) {
      return { type: 'tag', name: value.sourceString.trimEnd(), comment: optionalValue(comment, this.args.source), location: location(this, this.args.source) };
    },
    commodityDirective(_keyword, _space, symbol, comment, _trailingSpace, _lineEnd, body) {
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
    commodityProperty_format(_indent, _keyword, _space, value, comment, _trailingSpace, _lineEnd) {
      return {
        name: 'format',
        value: value.sourceString,
        formatSymbol: value.ast(this.args.source).symbol,
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    commodityProperty_default(_indent, _keyword, value, comment, _lineEnd) {
      return {
        name: 'default',
        value: optionalValue(value, this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: indentedLocation(_indent, this.args.source),
      };
    },
    commodityFormat(_quantity, _space, symbol) {
      return { symbol: symbol.sourceString };
    },
    commodityPropertyValue(_space, value) { return value.sourceString.trimEnd(); },

    priceDirective(_keyword, _space1, date, _space2, commodity, _space3, price, _space4, comment, _lineEnd) {
      return {
        type: 'price',
        date: date.ast(this.args.source),
        commodity: commodity.ast(this.args.source),
        price: price.ast(this.args.source),
        comment: optionalValue(comment, this.args.source),
        location: location(this, this.args.source),
      };
    },

    indentedComment(_indent, marker, _space, text, _lineEnd) {
      const value = text.sourceString.trim();
      const colon = value.indexOf(':');
      return {
        type: 'note',
        text: value,
        key: colon < 1 ? null : value.slice(0, colon).trim(),
        value: colon < 1 ? null : value.slice(colon + 1).trim(),
        location: location(marker, this.args.source),
      };
    },
    topLevelComment(_semicolon, _space, _text, _lineEnd) { return null; },
    postingComment(_semicolon, _space, date, _text) {
      return {
        date: optionalValue(date, this.args.source),
        comment: this.sourceString.slice(this.sourceString.indexOf(';') + 1).trim(),
      };
    },
    postingDate(_open, date, _close, _space) { return date.ast(this.args.source); },
    inlineComment(_space1, _semicolon, _space2, text) { return text.sourceString.trim(); },
    blankLine(_space, _newline) { return null; },

    date(_year1, _year2, _year3, _year4, _separator1, _month1, _month2, _separator2, _day1, _day2) {
      return parseDate(this.sourceString, this, this.args.source);
    },

    _iter(...children) { return children.map((child) => child.ast(this.args.source)); },
    _terminal() { return this.sourceString; },
  });

  function parse(sourceText, options) {
    const source = options.source || '<input>';
    const result = grammar.match(sourceText, 'document');
    if (result.failed()) {
      const value = result.getInterval().getLineAndColumn();
      throw syntaxError(result.shortMessage, source, value.lineNum, value.colNum);
    }
    return semantics(result).ast(source);
  }

  return { $$private: { parse } };
};
