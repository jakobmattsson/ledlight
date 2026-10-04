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

  function parseAccountPattern(pattern) {
    const anchoredAtStart = pattern.startsWith('^');
    const anchoredAtEnd = pattern.endsWith('$');
    return {
      anchoredAtStart,
      anchoredAtEnd,
      value: pattern.slice(anchoredAtStart ? 1 : 0, anchoredAtEnd ? -1 : undefined),
    };
  }

  function accountMatches(account, pattern) {
    const { anchoredAtStart, anchoredAtEnd, value } = parseAccountPattern(pattern);
    if (anchoredAtStart && anchoredAtEnd) return account === value;
    if (anchoredAtStart) return account.startsWith(value);
    if (anchoredAtEnd) return account.endsWith(value);
    return account.includes(value);
  }

  function accountPatternFilter(column, pattern) {
    const { anchoredAtStart, anchoredAtEnd, value } = parseAccountPattern(pattern);
    if (value.length === 0) {
      return { sql: anchoredAtStart && anchoredAtEnd ? `${column} = ''` : '1 = 1', parameters: [] };
    }
    if (anchoredAtStart && anchoredAtEnd) {
      return { sql: `${column} = ?`, parameters: [value] };
    }
    if (anchoredAtStart) {
      const upperBound = prefixUpperBound(value);
      return upperBound === undefined
        ? { sql: `${column} >= ?`, parameters: [value] }
        : { sql: `(${column} >= ? AND ${column} < ?)`, parameters: [value, upperBound] };
    }
    if (anchoredAtEnd) {
      return {
        sql: `substr(${column}, -length(?)) = ?`,
        parameters: [value, value],
      };
    }
    return { sql: `instr(${column}, ?) > 0`, parameters: [value] };
  }

  function accountFilter(column, patterns) {
    const filters = patterns.map((pattern) => accountPatternFilter(column, pattern));
    return {
      sql: `(${filters.map((filter) => filter.sql).join(' OR ')})`,
      parameters: filters.flatMap((filter) => filter.parameters),
    };
  }

  return {
    accountFilter,
    accountMatches,
    $$private: { parseAccountPattern, prefixUpperBound },
  };
};
