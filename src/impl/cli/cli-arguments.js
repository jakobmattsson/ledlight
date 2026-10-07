'use strict';

const { Command, Help, InvalidArgumentError, Option } = require('commander');
const HELP_GROUP = Symbol('helpGroup');
const HELP_DETAILS = Symbol('helpDetails');

function formatGroupedHelp(command, helper) {
  const help = Help.prototype.formatHelp.call(helper, command, helper);
  if (command.parent || command.commands.length === 0) return help;

  const termWidth = helper.padWidth(command, helper);
  const visibleCommands = helper.visibleCommands(command);
  const formatCommands = (group) => visibleCommands
    .filter((candidate) => candidate[HELP_GROUP] === group)
    .map((candidate) => helper.formatItem(
      helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
      termWidth,
      helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
      helper,
    ));
  const defaultCommandList = visibleCommands.map((candidate) => helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
    helper,
  ));
  const defaultSection = [helper.styleTitle('Commands:'), ...defaultCommandList, ''].join('\n');
  const groups = [...new Set(visibleCommands.map((candidate) => candidate[HELP_GROUP]))]
    .sort((left, right) => left.localeCompare(right, 'en'));
  const groupedSection = groups.flatMap((group) => [
    helper.styleTitle(`${group}:`),
    ...formatCommands(group),
    '',
  ]).join('\n');

  return help.replace(defaultSection, groupedSection);
}

module.exports = ({
  commands,
  cliConfiguration,
  project: { apiDefinitions: projectDefinitions },
}) => {
  const definitions = Object.freeze({ ...projectDefinitions });
  const commandByName = new Map(commands.map((command) => [command.name, command]));

  function createProgram() {
    const program = new Command().name('ledlight').usage('<command> [options]')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureHelp({
        formatHelp: formatGroupedHelp,
        subcommandTerm: (command) => [command.name(), ...command.aliases()].join('|'),
      })
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    for (const definition of commands) {
      const command = program.command(definition.name).description(definition.description);
      command.apiOperation = definition.operation;
      command[HELP_GROUP] = definition.group;
      command[HELP_DETAILS] = definition.helpDetails;
      definition.configure(command);
      const mandatoryOptions = command.options
        .filter((option) => option.mandatory)
        .map((option) => option.flags);
      command.usage(`${mandatoryOptions.join(' ')} [options]`);
      command.addOption(new Option('--help', 'show command help'));
    }
    program.addOption(new Option('--version', 'show the package version'));
    program.addOption(new Option('--help', 'show help'));
    return program;
  }

  function usage(commandName) {
    const program = createProgram();
    if (commandName === undefined) {
      return `${program.helpInformation().trimEnd()}\n\n` +
        'Run "ledlight <command> --help" for detailed command usage.';
    }
    const command = program.commands.find((candidate) =>
      candidate.name() === commandName || candidate.aliases().includes(commandName));
    if (!command) throw new Error(`Unknown command: ${commandName}`);
    return [command.helpInformation().trimEnd(), command[HELP_DETAILS]]
      .filter(Boolean)
      .join('\n\n');
  }

  function commandCoverage() {
    return Object.fromEntries(createProgram().commands.map((command) => {
      const options = command.options.filter((option) => option.attributeName() !== 'help');
      const inputs = options.filter((option) => !option.outputInput).map((option) =>
        option.attributeName() === 'file' ? 'journalPath' : option.attributeName());
      const outputInputs = options.filter((option) => option.outputInput)
        .map((option) => option.attributeName());
      return [command.apiOperation, {
        command: command.name(),
        inputs,
        outputInputs,
      }];
    }));
  }

  function parseArguments(arguments_) {
    arguments_ = cliConfiguration.apply(arguments_);
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) {
      command.action((...actionArguments) => {
        const commandObject = actionArguments.at(-1);
        selectedCommand = { name: command.name(), options: commandObject.opts() };
      });
    }
    try {
      program.parse(arguments_, { from: 'user' });
    } catch (error) {
      if (!(error.code?.startsWith('commander.') || error instanceof InvalidArgumentError)) throw error;
      const message = error.message.replace(/^error: /u, '');
      const command = program.commands.find((candidate) => candidate.name() === arguments_[0]);
      throw new Error(`${message}\n\n${(command || program).helpInformation().trimEnd()}`);
    }
    if (!selectedCommand) throw new Error(usage());
    const definition = commandByName.get(selectedCommand.name);
    const inputs = new Set(definitions[definition.operation].inputs);
    const options = Object.fromEntries(Object.entries(selectedCommand.options)
      .filter(([name, value]) => inputs.has(name) && value !== undefined));
    return {
      command: definition.name,
      journalPath: selectedCommand.options.file,
      cliOptions: selectedCommand.options,
      options,
    };
  }

  const apiInputCoverage = commandCoverage();
  const apiCommands = Object.freeze(Object.fromEntries(
    Object.entries(apiInputCoverage).map(([operation, coverage]) => [operation, coverage.command]),
  ));
  const operationNames = new Set([
    ...Object.keys(definitions),
    ...Object.keys(apiInputCoverage),
  ]);
  for (const operation of operationNames) {
    const apiInputs = [...(definitions[operation]?.inputs ?? [])].sort();
    const cliInputs = [...(apiInputCoverage[operation]?.inputs ?? [])].sort();
    if (JSON.stringify(apiInputs) !== JSON.stringify(cliInputs)) {
      throw new Error(`CLI inputs do not cover the ${operation} API contract`);
    }
  }
  return { apiCommands, apiInputCoverage, parseArguments, usage };
};
