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
    const excluded = pattern.startsWith('~');
    const selection = excluded ? pattern.slice(1) : pattern;
    const anchoredAtStart = selection.startsWith('^');
    const anchoredAtEnd = selection.endsWith('$');
    return {
      excluded,
      anchoredAtStart,
      anchoredAtEnd,
      value: selection.slice(anchoredAtStart ? 1 : 0, anchoredAtEnd ? -1 : undefined),
    };
  }

  function patternMatches(account, pattern) {
    const { anchoredAtStart, anchoredAtEnd, value } = pattern;
    if (anchoredAtStart && anchoredAtEnd) return account === value;
    if (anchoredAtStart) return account.startsWith(value);
    if (anchoredAtEnd) return account.endsWith(value);
    return account.includes(value);
  }

  function accountMatches(account, patterns) {
    const parsed = patterns.map(parseAccountPattern);
    return (parsed.filter((pattern) => !pattern.excluded).some((pattern) =>
      patternMatches(account, pattern)) || parsed.every((pattern) => pattern.excluded)) &&
      parsed.filter((pattern) => pattern.excluded).every((pattern) =>
        !patternMatches(account, pattern));
  }

  function accountPatternFilter(column, pattern) {
    const { anchoredAtStart, anchoredAtEnd, value } = pattern;
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
    const parsed = patterns.map(parseAccountPattern);
    const included = parsed.filter((pattern) => !pattern.excluded)
      .map((pattern) => accountPatternFilter(column, pattern));
    const excluded = parsed.filter((pattern) => pattern.excluded)
      .map((pattern) => accountPatternFilter(column, pattern));
    const clauses = [];
    if (included.length > 0) {
      clauses.push(`(${included.map((filter) => filter.sql).join(' OR ')})`);
    }
    clauses.push(...excluded.map((filter) => `NOT (${filter.sql})`));
    return {
      sql: clauses.length === 1 && included.length > 0
        ? clauses[0] : `(${clauses.join(' AND ')})`,
      parameters: [...included, ...excluded].flatMap((filter) => filter.parameters),
    };
  }

  return {
    accountFilter,
    accountMatches,
    $$private: { parseAccountPattern, prefixUpperBound },
  };
};
