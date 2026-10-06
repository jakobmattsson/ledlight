'use strict';

const { InvalidArgumentError, Option } = require('commander');

const collect = (value, previous) => (previous || []).concat(value);
const singleValue = (optionName) => {
  let supplied = false;
  return (value) => {
    if (value.startsWith('--')) throw new InvalidArgumentError(`${optionName} expects a value`);
    if (supplied) throw new InvalidArgumentError(`${optionName} may only be specified once`);
    supplied = true;
    return value;
  };
};

function addValue(command, flags, description, settings_) {
  const settings = settings_ ?? {};
  const option = new Option(flags, settings.required ? `(REQUIRED) ${description}` : description);
  const parseValue = settings.repeatable ? collect : singleValue(flags.split(' ')[0]);
  if (settings.choices) {
    option.choices(settings.choices);
    const parseChoice = option.parseArg;
    option.argParser((value, previous) => parseChoice(parseValue(value, previous), previous));
  } else {
    option.argParser(parseValue);
  }
  if (settings.required) option.makeOptionMandatory();
  if (settings.defaultValue !== undefined) option.default(settings.defaultValue);
  if (settings.apiInput) option.apiInput = settings.apiInput;
  if (settings.outputInput) option.outputInput = settings.outputInput;
  return command.addOption(option);
}

function addBoolean(command, flags, description, input, destination_) {
  const option = new Option(flags, description);
  option[destination_ ?? 'apiInput'] = input;
  return command.addOption(option);
}

const journal = (command) => addValue(
  command, '--file <path>', 'read this journal file, or - for stdin (piped input is detected automatically)',
  { required: true, apiInput: 'journalPath' },
);
const accounts = (command) => addValue(
  command, '--accounts <pattern>', 'include accounts matching a pattern (repeatable)',
  { repeatable: true, apiInput: 'accounts' },
);
const usage = (command, noun) => addValue(
  command, '--usage <selection>', `select all, used, or unused ${noun}`,
  { choices: ['all', 'used', 'unused'], defaultValue: 'used', apiInput: 'usage' },
);
const date = (command, flags, description, input) => addValue(
  command, flags, description, { apiInput: input },
);
const dateBasis = (command) => addValue(
  command, '--date-basis <basis>', 'select posting or transaction dates',
  { choices: ['posting', 'transaction'], defaultValue: 'posting', apiInput: 'dateBasis' },
);
const valuation = (command) => addValue(
  command, '--valuation <valuation>', 'value holdings at cost or market prices',
  { choices: ['cost', 'market'], defaultValue: 'market', apiInput: 'valuation' },
);
const format = (command) => addValue(
  command, '--format <format>', 'select the output format',
  { choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: 'format' },
);
const details = (command, description) => addBoolean(
  command, '--details', description, 'details', 'outputInput',
);
const json = (command) => addBoolean(
  command, '--json', 'write the complete API result as JSON', 'json', 'outputInput',
);
const compact = (object) => Object.fromEntries(
  Object.entries(object).filter(([, value]) => value !== undefined),
);
const reportOptions = (options) => compact({
  from: options.from, to: options.to, accounts: options.accounts || [],
  dateBasis: options.dateBasis, invert: options.invert || undefined,
  valuation: options.valuation,
});

module.exports = {
  accounts, addBoolean, addValue, compact, date, dateBasis, details, format,
  journal, json, reportOptions, usage, valuation,
};
