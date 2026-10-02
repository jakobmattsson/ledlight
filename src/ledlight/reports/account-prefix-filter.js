'use strict';

module.exports = () => {

  const MAX_UNICODE_CODE_POINT = 0x10FFFF;

  function prefixUpperBound(prefix) {
    const codePoints = [...prefix];
    for (let index = codePoints.length - 1; index >= 0; index -= 1) {
      const value = codePoints[index].codePointAt(0);
      if (value === MAX_UNICODE_CODE_POINT) continue;
      const nextValue = value === 0xD7FF ? 0xE000 : value + 1;
      return `${codePoints.slice(0, index).join('')}${String.fromCodePoint(nextValue)}`;
    }
    return undefined;
  }

  function accountPrefixFilter(column, prefixes) {
    const clauses = [];
    const parameters = [];
    for (const prefix of prefixes) {
      const upperBound = prefixUpperBound(prefix);
      if (upperBound === undefined) {
        clauses.push(`${column} >= ?`);
        parameters.push(prefix);
      } else {
        clauses.push(`(${column} >= ? AND ${column} < ?)`);
        parameters.push(prefix, upperBound);
      }
    }
    return { sql: `(${clauses.join(' OR ')})`, parameters };
  }

  return { accountPrefixFilter, prefixUpperBound };
};
