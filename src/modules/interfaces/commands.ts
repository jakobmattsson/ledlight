'use strict';

type CommandDefinition = {
  description: string;
  helpDetails?: string;
  examples: string[];
  configure(command: unknown): void;
  prepareOutput?(result: unknown, options: unknown, format: unknown): unknown;
  loadFormatData?(journal: unknown): unknown;
  formatCsv?(result: unknown, options: unknown, format: unknown): string;
  formatText(result: unknown, options: unknown, format: unknown, descriptions?: unknown): string;
};
type Definition = { name: string; relativePath: string; value: CommandDefinition };
type NamedCommand = Readonly<CommandDefinition & { name: string; operation: string; group: string }>;
type CommandIndex = { definitions: ReadonlyArray<NamedCommand> };

export = ({ definitions }: { definitions: Definition[] }): CommandIndex => {
  const commands = definitions.map((definition: Definition): NamedCommand => {
    const command = definition.value;
    const match = /^([a-z]+(?:-[a-z]+)*)\/([a-z]+(?:-[a-z]+)*)\.js$/u.exec(definition.relativePath);
    if (!match) {
      throw new TypeError(`Command definition must be in one group directory: ${definition.relativePath}`);
    }
    const [, group, commandName] = match;
    return Object.freeze({
      description: command.description,
      examples: command.examples,
      configure: command.configure,
      formatText: command.formatText,
      ...(command.helpDetails === undefined ? {} : { helpDetails: command.helpDetails }),
      ...(command.prepareOutput === undefined ? {} : { prepareOutput: command.prepareOutput }),
      ...(command.loadFormatData === undefined ? {} : { loadFormatData: command.loadFormatData }),
      ...(command.formatCsv === undefined ? {} : { formatCsv: command.formatCsv }),
      name: commandName, operation: definition.name, group,
    });
  }).sort((left: NamedCommand, right: NamedCommand) => left.name.localeCompare(right.name, 'en'));
  return { definitions: Object.freeze(commands) };
};
