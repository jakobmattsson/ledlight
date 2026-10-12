'use strict';

module.exports = ({
  external: {
    commander: { InvalidArgumentError, Option }
  },
}: any) => {

  function collect(value: any, previous: any) {
    return (previous || []).concat(value);
  }

  function singleValue(optionName: any) {
    let supplied = false;
    return (value: any) => {
      if (value.startsWith('--')) throw new InvalidArgumentError(`${optionName} expects a value`);
      if (supplied) throw new InvalidArgumentError(`${optionName} may only be specified once`);
      supplied = true;
      return value;
    };
  }

  function addValue(command: any, flags: any, description: any, settings_?: any) {
    const settings = settings_ ?? {};
    const option = new Option(flags, settings.required ? `(REQUIRED) ${description}` : description);
    const parseValue = settings.repeatable ? collect : singleValue(flags.split(' ')[0]);
    if (settings.choices) {
      option.choices(settings.choices);
      const parseChoice = option.parseArg;
      option.argParser((value: any, previous: any) => parseChoice(parseValue(value, previous), previous));
    } else {
      option.argParser(parseValue);
    }
    if (settings.required) option.makeOptionMandatory();
    if (settings.defaultValue !== undefined) option.default(settings.defaultValue);
    if (settings.conflicts) option.conflicts(settings.conflicts);
    if (settings.outputInput) option.outputInput = true;
    return command.addOption(option);
  }

  function addBoolean(command: any, flags: any, description: any, settings: any) {
    const option = new Option(flags, description);
    if (settings?.outputInput) option.outputInput = true;
    return command.addOption(option);
  }

  function journal(command: any) {
    return addValue(
      command, '--file <path>', 'read this journal file, or - for stdin (piped input is detected automatically)',
      { required: true },
    );
  }

  function accounts(command: any) {
    return addValue(
      command, '--accounts <pattern>', 'select accounts (repeatable; * matches any text, ~ excludes)',
      { repeatable: true },
    );
  }

  function usage(command: any, noun: any) {
    return addValue(
      command, '--usage <selection>', `select ${noun} by journal use`,
      { choices: ['all', 'used', 'unused'], defaultValue: 'used' },
    );
  }

  function dateRange(command: any, fromDescription: any, toDescription: any) {
    addValue(command, '--from <date>', fromDescription);
    return addValue(command, '--to <date>', toDescription);
  }

  function dateBasis(command: any) {
    return addValue(
      command, '--date-basis <basis>', 'use posting or transaction dates to select activity',
      { choices: ['posting', 'transaction'], defaultValue: 'posting' },
    );
  }

  function valuation(command: any) {
    return addValue(
      command, '--valuation <method>', 'value holdings using recorded lot costs or market prices',
      { choices: ['cost', 'market'], defaultValue: 'market' },
    );
  }

  function format(command: any) {
    return addValue(
      command, '--format <format>', 'select the output format',
      { choices: ['text', 'json', 'csv'], defaultValue: 'text', outputInput: true },
    );
  }

  function details(command: any, description: any) {
    return addBoolean(command, '--details', description, { outputInput: true });
  }

  return {
    accounts, addBoolean, addValue, dateBasis, dateRange, details, format,
    journal, usage, valuation,
  };
};
