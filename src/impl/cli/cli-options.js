'use strict';

module.exports = ({ commander: { InvalidArgumentError, Option } }) => {

  function collect(value, previous) {
    return (previous || []).concat(value);
  }

  function singleValue(optionName) {
    let supplied = false;
    return (value) => {
      if (value.startsWith('--')) throw new InvalidArgumentError(`${optionName} expects a value`);
      if (supplied) throw new InvalidArgumentError(`${optionName} may only be specified once`);
      supplied = true;
      return value;
    };
  }

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
    if (settings.outputInput) option.outputInput = true;
    return command.addOption(option);
  }

  function addBoolean(command, flags, description, settings) {
    const option = new Option(flags, description);
    if (settings?.outputInput) option.outputInput = true;
    return command.addOption(option);
  }

  function journal(command) {
    return addValue(
      command, '--file <path>', 'read this journal file, or - for stdin (piped input is detected automatically)',
      { required: true },
    );
  }

  function accounts(command) {
    return addValue(
      command, '--accounts <pattern>', 'include matching accounts (repeatable; ^ and $ anchor names)',
      { repeatable: true },
    );
  }

  function usage(command, noun) {
    return addValue(
      command, '--usage <selection>', `select ${noun} by journal use`,
      { choices: ['all', 'used', 'unused'], defaultValue: 'used' },
    );
  }

  function dateRange(command, fromDescription, toDescription) {
    addValue(command, '--from <date>', fromDescription);
    return addValue(command, '--to <date>', toDescription);
  }

  function dateBasis(command) {
    return addValue(
      command, '--date-basis <basis>', 'use posting or transaction dates to select activity',
      { choices: ['posting', 'transaction'], defaultValue: 'posting' },
    );
  }

  function valuation(command) {
    return addValue(
      command, '--valuation <method>', 'value holdings using recorded lot costs or market prices',
      { choices: ['cost', 'market'], defaultValue: 'market' },
    );
  }

  function format(command) {
    return addValue(
      command, '--format <format>', 'select the output format',
      { choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: true },
    );
  }

  function details(command, description) {
    return addBoolean(command, '--details', description, { outputInput: true });
  }

  return {
    accounts, addBoolean, addValue, dateBasis, dateRange, details, format,
    journal, usage, valuation,
  };
};
