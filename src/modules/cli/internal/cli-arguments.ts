'use strict';

const HELP_GROUP = Symbol('helpGroup');
const HELP_DETAILS = Symbol('helpDetails');
const HELP_EXAMPLES = Symbol('helpExamples');

function formatGroupedHelp(Help: any, command: any, helper: any) {
  const help = Help.prototype.formatHelp.call(helper, command, helper);
  if (command.parent || command.commands.length === 0) return help;

  const termWidth = helper.padWidth(command, helper);
  const visibleCommands = helper.visibleCommands(command);
  const formatCommands = (group: any) => visibleCommands
    .filter((candidate: any) => candidate[HELP_GROUP] === group)
    .map((candidate: any) => helper.formatItem(
      helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
      termWidth,
      helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
      helper,
    ));
  const defaultCommandList = visibleCommands.map((candidate: any) => helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
    helper,
  ));
  const defaultSection = [helper.styleTitle('Commands:'), ...defaultCommandList, ''].join('\n');
  const groups = [...new Set(visibleCommands.map((candidate: any) => candidate[HELP_GROUP]))]
    .sort((left: any, right: any) => left.localeCompare(right, 'en'));
  const groupedSection = groups.flatMap((group: any) => [
    helper.styleTitle(`${group}:`),
    ...formatCommands(group),
    '',
  ]).join('\n');

  return help.replace(defaultSection, groupedSection);
}

module.exports = ({
  commands: { definitions: commands },
  cliConfiguration,
  project: { apiDefinitions: projectDefinitions },
  external: {
    commander: { Command, Help, InvalidArgumentError, Option }
  },
}: any) => {
  const definitions = Object.freeze({ ...projectDefinitions });
  const commandByName = new Map(commands.map((command: any) => [command.name, command]));

  function createProgram() {
    const program = new Command().name('ledlight').usage('<command> [options]')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureHelp({
        formatHelp: (command: any, helper: any) => formatGroupedHelp(Help, command, helper),
        subcommandTerm: (command: any) => [command.name(), ...command.aliases()].join('|'),
      })
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    for (const definition of commands) {
      const command = program.command(definition.name).description(definition.description);
      command.apiOperation = definition.operation;
      command[HELP_GROUP] = definition.group;
      command[HELP_DETAILS] = definition.helpDetails;
      command[HELP_EXAMPLES] = definition.examples;
      definition.configure(command);
      const mandatoryOptions = command.options
        .filter((option: any) => option.mandatory)
        .map((option: any) => option.flags);
      command.usage(`${mandatoryOptions.join(' ')} [options]`);
      command.addOption(new Option('--help', 'show command help'));
    }
    program.addOption(new Option('--version', 'show the package version'));
    program.addOption(new Option('--help', 'show help'));
    return program;
  }

  function usage(commandName?: any) {
    const program = createProgram();
    if (commandName === undefined) {
      return `${program.helpInformation().trimEnd()}\n\n` +
        'Run "ledlight <command> --help" for detailed command usage.\n\n' +
        'Example:\n  ledlight aggregate --file main.ledger';
    }
    const command = program.commands.find((candidate: any) =>
      candidate.name() === commandName || candidate.aliases().includes(commandName));
    if (!command) throw new Error(`Unknown command: ${commandName}`);
    return [
      command.helpInformation().trimEnd(),
      command[HELP_DETAILS],
      `Examples:\n${command[HELP_EXAMPLES].map((example: any) => `  ${example}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function commandCoverage() {
    return Object.fromEntries(createProgram().commands.map((command: any) => {
      const options = command.options.filter((option: any) => option.attributeName() !== 'help');
      const inputs = options.filter((option: any) => !option.outputInput).map((option: any) =>
        option.attributeName() === 'file' ? 'journalPath' : option.attributeName());
      const outputInputs = options.filter((option: any) => option.outputInput)
        .map((option: any) => option.attributeName());
      return [command.apiOperation, {
        command: command.name(),
        inputs,
        outputInputs,
      }];
    }));
  }

  function parseArguments(arguments_: any) {
    arguments_ = cliConfiguration.apply(arguments_);
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) {
      command.action((...actionArguments: any[]) => {
        const commandObject = actionArguments.at(-1);
        selectedCommand = { name: command.name(), options: commandObject.opts() };
      });
    }
    try {
      program.parse(arguments_, { from: 'user' });
    } catch (error: any) {
      if (!(error.code?.startsWith('commander.') || error instanceof InvalidArgumentError)) throw error;
      const message = error.message.replace(/^error: /u, '');
      const command = program.commands.find((candidate: any) => candidate.name() === arguments_[0]);
      throw new Error(`${message}\n\n${(command || program).helpInformation().trimEnd()}`, {
        cause: error,
      });
    }
    if (!selectedCommand) throw new Error(usage());
    const definition = commandByName.get((selectedCommand as any).name);
    const inputs = new Set(definitions[(definition as any).operation].inputs);
    const options = Object.fromEntries(Object.entries((selectedCommand as any).options)
      .filter(([name, value]: any) => inputs.has(name) && value !== undefined));
    return {
      command: (definition as any).name,
      journalPath: (selectedCommand as any).options.file,
      cliOptions: (selectedCommand as any).options,
      options,
    };
  }

  const apiInputCoverage = commandCoverage();
  const apiCommands = Object.freeze(Object.fromEntries(
    Object.entries(apiInputCoverage).map(([operation, coverage]: any) => [operation, coverage.command]),
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
