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
    return { excluded, value: excluded ? pattern.slice(1) : pattern };
  }

  function patternMatches(account, pattern) {
    const { value } = pattern;
    if (!value.includes('*')) return account === value;
    const expression = value.split('*').map((part) =>
      part.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`, 'su').test(account);
  }

  function accountMatches(account, patterns) {
    const parsed = patterns.map(parseAccountPattern);
    return (parsed.filter((pattern) => !pattern.excluded).some((pattern) =>
      patternMatches(account, pattern)) || parsed.every((pattern) => pattern.excluded)) &&
      parsed.filter((pattern) => pattern.excluded).every((pattern) =>
        !patternMatches(account, pattern));
  }

  function accountPatternFilter(column, pattern) {
    const { value } = pattern;
    if (!value.includes('*')) return { sql: `${column} = ?`, parameters: [value] };
    if (/^\*+$/u.test(value)) return { sql: '1 = 1', parameters: [] };
    if (/^[^*]+\*$/u.test(value)) {
      const prefix = value.slice(0, -1);
      const upperBound = prefixUpperBound(prefix);
      return upperBound === undefined
        ? { sql: `${column} >= ?`, parameters: [prefix] }
        : { sql: `(${column} >= ? AND ${column} < ?)`, parameters: [prefix, upperBound] };
    }
    if (/^\*[^*]+$/u.test(value)) {
      const suffix = value.slice(1);
      return {
        sql: `substr(${column}, -length(?)) = ?`,
        parameters: [suffix, suffix],
      };
    }
    if (/^\*[^*]+\*$/u.test(value)) {
      return { sql: `instr(${column}, ?) > 0`, parameters: [value.slice(1, -1)] };
    }
    const glob = value.replaceAll('[', '[[]').replaceAll('?', '[?]');
    return { sql: `${column} GLOB ?`, parameters: [glob] };
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
