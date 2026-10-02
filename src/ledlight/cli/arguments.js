'use strict';

const { Command, InvalidArgumentError, Option } = require('commander');

module.exports = () => {

  function collect(value, previous) {
    return (previous || []).concat(value);
  }

  function singleValue(optionName) {
    return (value, previous) => {
      if (value.startsWith('--')) {
        throw new InvalidArgumentError(`${optionName} expects a value`);
      }
      if (previous !== undefined) {
        throw new InvalidArgumentError(`${optionName} may only be specified once`);
      }
      return value;
    };
  }

  function addDateOption(command, flags, description) {
    return command.addOption(
      new Option(flags, description).argParser(singleValue(flags.split(' ')[0])),
    );
  }

  function addDateBasisOption(command) {
    const option = new Option(
      '--date-basis <basis>',
      'select posting or transaction dates',
    ).choices(['posting', 'transaction']);
    const parseChoice = option.parseArg;
    const parseSingleValue = singleValue('--date-basis');
    option.argParser((value, previous) => {
      const parsedValue = parseSingleValue(value, previous);
      return parseChoice(parsedValue, previous);
    });
    return command.addOption(option);
  }

  function addAccountOption(command) {
    return command.option(
      '--accounts <prefix>',
      'include an account prefix (repeatable)',
      collect,
    );
  }

  function createProgram() {
    const program = new Command()
      .name('ledlight')
      .description('Query Ledger-compatible accounting data')
      .helpOption(false)
      .addHelpCommand(false)
      .exitOverride()
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    const aggregate = program.command('aggregate').description('aggregate account balances');
    addDateOption(aggregate, '--from <date>', 'include entries on or after YYYY-MM-DD');
    addDateOption(aggregate, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountOption(aggregate);
    addDateBasisOption(aggregate);
    aggregate
      .option('--value', 'convert amounts to the valuation commodity')
      .option('--invert', 'invert the sign of report amounts')
      .option('--csv', 'write CSV output');

    const balanceHistory = program
      .command('balance-history')
      .description('show balances over time');
    addDateOption(balanceHistory, '--from <date>', 'include entries on or after YYYY-MM-DD');
    addDateOption(balanceHistory, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountOption(balanceHistory);
    addDateBasisOption(balanceHistory);
    balanceHistory
      .option('--invert', 'invert the sign of report amounts')
      .option('--csv', 'write CSV output');

    const gain = program.command('gain').description('show investment gains');
    addDateOption(gain, '--to <date>', 'include entries on or before YYYY-MM-DD');
    addAccountOption(gain);
    addDateBasisOption(gain);
    gain.option('--csv', 'write CSV output');

    const investmentPerformance = program
      .command('investment-performance')
      .description('show investment performance');
    addDateOption(
      investmentPerformance,
      '--from <date>',
      'include entries on or after YYYY-MM-DD',
    );
    addDateOption(
      investmentPerformance,
      '--to <date>',
      'include entries on or before YYYY-MM-DD',
    );
    addAccountOption(investmentPerformance);
    investmentPerformance
      .option('--commodities <name>', 'include a commodity (repeatable)', collect)
      .option(
        '--exclude-commodities <name>',
        'exclude a commodity (repeatable)',
        collect,
      )
      .option('--json', 'write JSON output');

    return program;
  }

  function usage() {
    const program = createProgram();
    return [program, ...program.commands]
      .map((command) => command.helpInformation().trimEnd())
      .join('\n\n');
  }

  function parsedResult(commandName, options) {
    const reportOptions = { accounts: options.accounts || [] };
    if (options.from !== undefined) reportOptions.from = options.from;
    if (options.to !== undefined) reportOptions.to = options.to;
    if (options.dateBasis !== undefined) reportOptions.dateBasis = options.dateBasis;
    if (options.invert) reportOptions.invert = true;
    if (options.value) reportOptions.inValuationCommodity = true;

    if (commandName === 'investment-performance') {
      reportOptions.commodities = options.commodities || [];
      reportOptions.excludeCommodities = options.excludeCommodities || [];
      return { reportOptions, json: options.json || false };
    }
    return { reportOptions, csv: options.csv || false };
  }

  function parseArguments(arguments_) {
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) {
      command.action((options) => {
        selectedCommand = { name: command.name(), options };
      });
    }

    try {
      program.parse(arguments_, { from: 'user' });
    } catch (error) {
      if (!error.code?.startsWith('commander.')) throw error;
      const message = error.message.replace(/^error: /u, '');
      const command = program.commands.find((candidate) => candidate.name() === arguments_[0]);
      const help = (command || program).helpInformation().trimEnd();
      throw new Error(`${message}\n\n${help}`);
    }

    if (!selectedCommand) throw new Error(usage());
    return parsedResult(selectedCommand.name, selectedCommand.options);
  }

  return {
    parseArguments,
    usage,
  };
};
