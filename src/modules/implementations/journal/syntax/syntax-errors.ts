'use strict';

module.exports = ({
  core: {
    publicErrors: { errorCodes, withCode },
  },
}: any) => {

  function syntaxError(message: string, source: any, line: any, column: number) {
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
