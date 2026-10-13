'use strict';

export = ({
  core: { publicErrors: { createError, errorCodes } },
  external: {
    zod: { z }
  },
}: any) => {

  const nonEmptyString = z.string().min(1, { error: 'must be a non-empty string' });
  const stringList = z.array(nonEmptyString)
    .transform((values: string[]) => [...new Set(values)]);
  const accounts = stringList.default([]);
  const booleanOption = z.boolean({ error: 'must be a boolean' }).default(false);
  const dateBasis = z.enum(['posting', 'transaction'], { error: 'Invalid dateBasis' })
    .default('posting');
  const dateOption = z.iso.date({ error: 'must be a valid date in YYYY-MM-DD format' }).optional();
  const dateRange = { from: dateOption, to: dateOption };
  const usage = z.enum(['all', 'used', 'unused']).default('all');
  const valuation = z.enum(['cost', 'market'], { error: 'Invalid valuation' }).default('market');

  function validateDateRange(input: { from?: string; to?: string }, context: {
    addIssue(issue: { code: 'custom'; message: string; path: string[] }): void;
  }): void {
    if (input.from && input.to && input.from > input.to) {
      context.addIssue({
        code: 'custom',
        message: `date ${input.from} is after to date ${input.to}`,
        path: ['from'],
      });
    }
  }

  const invalidInput = (message: string) => createError(errorCodes.INVALID_API_INPUT, message, TypeError);

  function parseOptions(schema: { safeParse(value: unknown): { success: boolean; data?: unknown; error: {
    issues: Array<{ code: string; keys: string[]; path: Array<string | number>; message: string }>;
  } }; }, value: unknown, operationName: string) {
    const input = value === undefined ? {} : value;
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

  return {
    accounts,
    booleanOption,
    dateBasis,
    dateOption,
    dateRange,
    stringList,
    usage,
    valuation,
    validateDateRange,
    parseOptions,
  };
};
