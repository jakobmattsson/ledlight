'use strict';

module.exports = () => {

  function inputObject(value, operationName) {
    const input = value ?? {};
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error(`${operationName} options must be an object`);
    }
    return input;
  }

  function knownOptions(value, allowedNames, operationName) {
    const input = inputObject(value, operationName);
    const allowed = new Set(allowedNames);
    const unknown = Object.keys(input).filter((name) => !allowed.has(name));
    if (unknown.length > 0) {
      throw new Error(`Unknown ${operationName} option${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
    }
    return input;
  }

  function booleanOption(input, name) {
    const value = input[name];
    if (value === undefined) return false;
    if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
    return value;
  }

  function stringList(value, name, deduplicate) {
    const result = value ?? [];
    if (!Array.isArray(result) || result.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw new Error(`${name} must be an array of non-empty strings`);
    }
    return deduplicate ? [...new Set(result)] : [...result];
  }

  function assertDate(value, name) {
    if (value === undefined) return;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      throw new Error(`Invalid ${name} date: ${JSON.stringify(value)}; expected YYYY-MM-DD`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Invalid ${name} date: ${JSON.stringify(value)}`);
    }
  }

  function assertDateInterval(from, to) {
    assertDate(from, '--from');
    assertDate(to, '--to');
    if (from && to && from > to) throw new Error(`--from date ${from} is after --to date ${to}`);
  }

  function dateBasis(value) {
    const normalized = value ?? 'posting';
    if (normalized !== 'posting' && normalized !== 'transaction') {
      throw new Error(`Invalid dateBasis: ${JSON.stringify(normalized)}; expected posting or transaction`);
    }
    return normalized;
  }

  return {
    assertDate,
    assertDateInterval,
    booleanOption,
    dateBasis,
    knownOptions,
    stringList,
  };
};
