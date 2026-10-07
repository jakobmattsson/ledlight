'use strict';

module.exports = ({ publicErrors: { errorCodes, withCode } }) => {

  function syntaxError(message, source, line, column) {
    const error = withCode(
      new SyntaxError(`${source}:${line}:${column}: ${message}`),
      errorCodes.SYNTAX,
    );
    error.source = source;
    error.line = line;
    error.column = column;
    error.detail = message;
    return error;
  }

  return { syntaxError };
};
