'use strict';

module.exports = ({
  syntaxErrors: { syntaxError },
}) => {

  const TOKEN = Object.freeze({ NUMBER: 1, SYMBOL: 2, AT: 3, TOTAL_AT: 4, EQUALS: 5, EOF: 6 });

  function isSpace(code) { return code === 32 || code === 9; }
  function isDigit(code) { return code >= 48 && code <= 57; }
  function isCommodityCharacter(code) {
    return !isSpace(code) && code !== 10 && code !== 13 && code !== 34 && code !== 39 &&
      code !== 59 && code !== 61 && code !== 64;
  }

  class AmountLexer {
    constructor(input, source, line, baseColumn) {
      this.input = input;
      this.source = source;
      this.line = line;
      this.baseColumn = baseColumn;
      this.offset = 0;
    }

    next() {
      const { input } = this;
      const length = input.length;
      while (this.offset < length && isSpace(input.charCodeAt(this.offset))) this.offset++;
      const start = this.offset;
      if (start === length) return { type: TOKEN.EOF, value: '', start };
      const code = input.charCodeAt(this.offset);
      if (code === 61) {
        this.offset++;
        return { type: TOKEN.EQUALS, value: '=', start };
      }
      if (code === 64) {
        this.offset++;
        if (input.charCodeAt(this.offset) === 64) {
          this.offset++;
          return { type: TOKEN.TOTAL_AT, value: '@@', start };
        }
        return { type: TOKEN.AT, value: '@', start };
      }
      if (code === 34) {
        let cursor = this.offset + 1;
        while (cursor < length && input.charCodeAt(cursor) !== 34 && input.charCodeAt(cursor) !== 10 && input.charCodeAt(cursor) !== 13) cursor++;
        if (cursor === length || input.charCodeAt(cursor) !== 34) this.error('Unterminated quoted commodity symbol', start);
        this.offset = cursor + 1;
        return { type: TOKEN.SYMBOL, value: input.slice(start, this.offset), start };
      }

      let cursor = this.offset;
      if (code === 43 || code === 45) cursor++;
      const integerStart = cursor;
      while (cursor < length && isDigit(input.charCodeAt(cursor))) cursor++;
      let validNumber = cursor > integerStart;
      if (input.charCodeAt(cursor) === 46) {
        const fractionStart = ++cursor;
        while (cursor < length && isDigit(input.charCodeAt(cursor))) cursor++;
        validNumber = validNumber && cursor > fractionStart;
      }
      if (validNumber && (cursor === length || isSpace(input.charCodeAt(cursor)) || input.charCodeAt(cursor) === 61 || input.charCodeAt(cursor) === 64)) {
        this.offset = cursor;
        return { type: TOKEN.NUMBER, value: input.slice(start, cursor), start };
      }

      cursor = start;
      while (cursor < length && isCommodityCharacter(input.charCodeAt(cursor))) cursor++;
      if (cursor === start) this.error('Invalid commodity symbol character', start);
      this.offset = cursor;
      return { type: TOKEN.SYMBOL, value: input.slice(start, cursor), start };
    }

    error(message, offset) {
      throw syntaxError(message, this.source, this.line, this.baseColumn + offset);
    }
  }

  class AmountParser {
    constructor(input, source, line, baseColumn) {
      this.lexer = new AmountLexer(input, source, line, baseColumn);
      this.current = this.lexer.next();
    }
    advance() { const token = this.current; this.current = this.lexer.next(); return token; }
    parseAmount(label) {
      if (this.current.type !== TOKEN.NUMBER) this.lexer.error(`Expected a number for ${label}`, this.current.start);
      const quantity = this.advance().value;
      if (this.current.type !== TOKEN.SYMBOL) {
        this.lexer.error(`Expected a commodity symbol for ${label}`, this.current.start);
      }
      const commodity = this.advance().value;
      return { quantity, commodity };
    }
    parse() {
      if (this.current.type === TOKEN.EOF) return null;
      if (this.current.type === TOKEN.EQUALS) {
        this.advance();
        const balanceAssignment = this.parseAmount('balance assignment');
        this.expectEnd();
        return { amount: null, cost: null, balanceAssignment, balanceAssertion: null };
      }
      const amount = this.parseAmount('posting amount');
      let cost = null;
      let balanceAssertion = null;
      if (this.current.type === TOKEN.AT || this.current.type === TOKEN.TOTAL_AT) {
        const total = this.advance().type === TOKEN.TOTAL_AT;
        cost = { total, amount: this.parseAmount('cost') };
      }
      if (this.current.type === TOKEN.EQUALS) {
        this.advance();
        balanceAssertion = this.parseAmount('balance assertion');
      }
      this.expectEnd();
      return { amount, cost, balanceAssignment: null, balanceAssertion };
    }
    expectEnd() {
      if (this.current.type !== TOKEN.EOF) this.lexer.error(`Unexpected token ${JSON.stringify(this.current.value)}`, this.current.start);
    }
  }

  function parseAmountExpression(input, location) {
    return new AmountParser(input, location.source, location.line, location.column).parse();
  }

  return { parseAmountExpression };
};
