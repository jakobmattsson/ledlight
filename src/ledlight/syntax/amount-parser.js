'use strict';

module.exports = ({
  srcLedlightSyntaxErrors: { LedgerSyntaxError },
}) => {

  const TOKEN = Object.freeze({ NUMBER: 1, SYMBOL: 2, AT: 3, TOTAL_AT: 4, EQUALS: 5, EOF: 6 });

  function isSpace(code) { return code === 32 || code === 9; }
  function isDigit(code) { return code >= 48 && code <= 57; }

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

      let cursor = this.offset;
      if (code === 43 || code === 45) cursor++;
      let digits = 0;
      while (cursor < length && isDigit(input.charCodeAt(cursor))) { cursor++; digits++; }
      if (input.charCodeAt(cursor) === 46) {
        cursor++;
        while (cursor < length && isDigit(input.charCodeAt(cursor))) { cursor++; digits++; }
      }
      if (digits > 0 && (cursor === length || isSpace(input.charCodeAt(cursor)) || input.charCodeAt(cursor) === 61 || input.charCodeAt(cursor) === 64)) {
        this.offset = cursor;
        return { type: TOKEN.NUMBER, value: input.slice(start, cursor), start };
      }

      if (code === 34 || code === 39) {
        const quote = code;
        cursor = ++this.offset;
        while (cursor < length && input.charCodeAt(cursor) !== quote) cursor++;
        if (cursor === length) this.error('Unterminated quoted commodity', start);
        const value = input.slice(this.offset, cursor);
        this.offset = cursor + 1;
        return { type: TOKEN.SYMBOL, value, start };
      }

      cursor = start;
      while (cursor < length && !isSpace(input.charCodeAt(cursor)) && input.charCodeAt(cursor) !== 61 && input.charCodeAt(cursor) !== 64) cursor++;
      this.offset = cursor;
      return { type: TOKEN.SYMBOL, value: input.slice(start, cursor), start };
    }

    error(message, offset) {
      throw new LedgerSyntaxError(message, this.source, this.line, this.baseColumn + offset);
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
      const commodity = this.current.type === TOKEN.SYMBOL ? this.advance().value : null;
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
