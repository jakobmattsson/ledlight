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

  return { parseOptions };
};
