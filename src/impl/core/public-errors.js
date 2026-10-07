'use strict';

module.exports = () => {

  const errorCodes = Object.freeze({
    SYNTAX: 'LEDLIGHT_SYNTAX',
    INVALID_API_INPUT: 'LEDLIGHT_INVALID_API_INPUT',
    PROJECT_CONFIGURATION: 'LEDLIGHT_PROJECT_CONFIGURATION',
    MISSING_VALUATION_DATA: 'LEDLIGHT_MISSING_VALUATION_DATA',
    DATABASE: 'LEDLIGHT_DATABASE',
  });

  function withCode(error, code) {
    if (error.code === undefined) error.code = code;
    return error;
  }

  function createError(code, message, ErrorType) {
    const Constructor = ErrorType ?? Error;
    return withCode(new Constructor(message), code);
  }

  function databaseError(error) {
    if (error.code && !String(error.code).startsWith('SQLITE_')) return error;
    if (String(error.code).startsWith('SQLITE_')) error.sqliteCode = error.code;
    error.code = errorCodes.DATABASE;
    return error;
  }

  return { createError, databaseError, errorCodes, withCode };
};
