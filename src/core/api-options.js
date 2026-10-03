'use strict';

module.exports = ({ publicErrors: { createError, errorCodes } }) => {

  const invalidInput = (message) => createError(errorCodes.INVALID_API_INPUT, message, TypeError);

  function parseOptions(schema, value, operationName) {
    const input = value ?? {};
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw invalidInput(`${operationName} options must be an object`);
    }
    const unrecognized = result.error.issues.find((issue) => issue.code === 'unrecognized_keys');
    if (unrecognized) {
      throw invalidInput(
        `Unknown ${operationName} option${unrecognized.keys.length === 1 ? '' : 's'}: ` +
        unrecognized.keys.join(', '),
      );
    }
    const issue = result.error.issues[0];
    const name = issue.path.length > 0 ? `${issue.path.join('.')} ` : '';
    throw invalidInput(`${name}${issue.message}`);
  }

  function assertDate(value, name) {
    if (value === undefined) return;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      throw invalidInput(`Invalid ${name} date: ${JSON.stringify(value)}; expected YYYY-MM-DD`);
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw invalidInput(`Invalid ${name} date: ${JSON.stringify(value)}`);
    }
  }

  function assertDateInterval(from, to) {
    assertDate(from, '--from');
    assertDate(to, '--to');
    if (from && to && from > to) throw invalidInput(`--from date ${from} is after --to date ${to}`);
  }

  return {
    assertDate,
    assertDateInterval,
    parseOptions,
  };
};
