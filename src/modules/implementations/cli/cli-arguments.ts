'use strict';

import type { Command, Help, Option } from 'commander';

const HELP_GROUP = Symbol('helpGroup');
const HELP_DETAILS = Symbol('helpDetails');
const HELP_EXAMPLES = Symbol('helpExamples');

type CliCommand = Command & {
  apiOperation?: string;
  [HELP_GROUP]?: string;
  [HELP_DETAILS]?: string;
  [HELP_EXAMPLES]?: string[];
};
type CliOption = Option & { outputInput?: boolean };
type CliDefinition = {
  name: string; operation: string; group: string; description: string;
  helpDetails?: string; examples: string[]; configure(command: Command): void;
};
type ApiDefinition = { inputs: string[] };
type Coverage = { command: string; inputs: string[]; outputInputs: string[] };


function formatGroupedHelp(Help: typeof import('commander').Help, command: CliCommand, helper: Help) {
  const help = Help.prototype.formatHelp.call(helper, command, helper);
  if (command.parent || command.commands.length === 0) return help;

  const termWidth = helper.padWidth(command, helper);
  const visibleCommands = helper.visibleCommands(command);
  const formatCommands = (group: string) => visibleCommands
    .filter((candidate: CliCommand) => candidate[HELP_GROUP] === group)
    .map((candidate: CliCommand) => helper.formatItem(
      helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
      termWidth,
      helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
      helper,
    ));
  const defaultCommandList = visibleCommands.map((candidate: CliCommand) => helper.formatItem(
    helper.styleSubcommandTerm(helper.subcommandTerm(candidate)),
    termWidth,
    helper.styleSubcommandDescription(helper.subcommandDescription(candidate)),
    helper,
  ));
  const defaultSection = [helper.styleTitle('Commands:'), ...defaultCommandList, ''].join('\n');
  const groups = [...new Set(visibleCommands.map((candidate: CliCommand) => candidate[HELP_GROUP]))]
    .filter((group): group is string => group !== undefined)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const groupedSection = groups.flatMap((group: string) => [
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
}: {
  commands: { definitions: CliDefinition[] };
  cliConfiguration: { apply(arguments_: string[]): string[] };
  project: { apiDefinitions: Record<string, ApiDefinition> };
  external: { commander: typeof import('commander') };
}) => {
  const definitions = Object.freeze({ ...projectDefinitions });
  const commandByName = new Map(commands.map((command: CliDefinition) => [command.name, command]));

  function createProgram() {
    const program = new Command().name('ledlight').usage('<command> [options]')
      .description('Query Ledger-compatible accounting data').helpOption(false)
      .addHelpCommand(false).exitOverride()
      .configureHelp({
        formatHelp: (command: Command, helper: Help) => formatGroupedHelp(Help, command as CliCommand, helper),
        subcommandTerm: (command: Command) => [command.name(), ...command.aliases()].join('|'),
      })
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });

    for (const definition of commands) {
      const command = program.command(definition.name).description(definition.description) as CliCommand;
      command.apiOperation = definition.operation;
      command[HELP_GROUP] = definition.group;
      command[HELP_DETAILS] = definition.helpDetails;
      command[HELP_EXAMPLES] = definition.examples;
      definition.configure(command);
      const mandatoryOptions = command.options
        .filter((option: Option) => option.mandatory)
        .map((option: Option) => option.flags);
      command.usage(`${mandatoryOptions.join(' ')} [options]`);
      command.addOption(new Option('--help', 'show command help'));
    }
    program.addOption(new Option('--version', 'show the package version'));
    program.addOption(new Option('--help', 'show help'));
    return program;
  }

  function usage(commandName?: string) {
    const program = createProgram();
    if (commandName === undefined) {
      return `${program.helpInformation().trimEnd()}\n\n` +
        'Run "ledlight <command> --help" for detailed command usage.\n\n' +
        'Example:\n  ledlight aggregate --file main.ledger';
    }
    const command = program.commands.find((candidate: CliCommand) =>
      candidate.name() === commandName || candidate.aliases().includes(commandName));
    if (!command) throw new Error(`Unknown command: ${commandName}`);
    return [
      command.helpInformation().trimEnd(),
      (command as CliCommand)[HELP_DETAILS],
      `Examples:\n${(command as CliCommand)[HELP_EXAMPLES]!.map((example: string) => `  ${example}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  function commandCoverage(): Record<string, Coverage> {
    return Object.fromEntries(createProgram().commands.map((command: CliCommand) => {
      const options = command.options.filter((option: Option) => option.attributeName() !== 'help');
      const inputs = options.filter((option: Option) => !(option as CliOption).outputInput).map((option: Option) =>
        option.attributeName() === 'file' ? 'journalPath' : option.attributeName());
      const outputInputs = options.filter((option: Option) => (option as CliOption).outputInput)
        .map((option: Option) => option.attributeName());
      return [command.apiOperation, {
        command: command.name(),
        inputs,
        outputInputs,
      }];
    }));
  }

  function parseArguments(arguments_: string[]) {
    arguments_ = cliConfiguration.apply(arguments_);
    const program = createProgram();
    if (arguments_.length === 0) throw new Error(usage());
    let selectedCommand;
    for (const command of program.commands) {
      command.action((...actionArguments: unknown[]) => {
        const commandObject = actionArguments.at(-1) as Command;
        selectedCommand = { name: command.name(), options: commandObject.opts() };
      });
    }
    try {
      program.parse(arguments_, { from: 'user' });
    } catch (error: unknown) {
      if (!(error instanceof Error &&
        (('code' in error && typeof error.code === 'string' && error.code.startsWith('commander.')) ||
          error instanceof InvalidArgumentError))) throw error;
      const message = error.message.replace(/^error: /u, '');
      const command = program.commands.find((candidate: CliCommand) => candidate.name() === arguments_[0]);
      throw new Error(`${message}\n\n${(command || program).helpInformation().trimEnd()}`, {
        cause: error,
      });
    }
    if (!selectedCommand) throw new Error(usage());
    const selected = selectedCommand as { name: string; options: Record<string, unknown> };
    const definition = commandByName.get(selected.name);
    if (!definition) throw new Error(`Unknown command: ${selected.name}`);
    const inputs = new Set(definitions[definition.operation]!.inputs);
    const options = Object.fromEntries(Object.entries(selected.options)
      .filter(([name, value]) => inputs.has(name) && value !== undefined));
    return {
      command: definition.name,
      journalPath: selected.options.file,
      cliOptions: selected.options,
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
