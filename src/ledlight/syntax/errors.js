'use strict';

module.exports = () => {

  class LedgerSyntaxError extends SyntaxError {
    constructor(message, source, line, column) {
      super(`${source}:${line}:${column}: ${message}`);
      this.name = 'LedgerSyntaxError';
      this.source = source;
      this.line = line;
      this.column = column;
    }
  }

  return { LedgerSyntaxError };
};
