'use strict';

type Definition = { name: string; relativePath: string; value: object };
type CommandDefinition = { name: string };


module.exports = ({ definitions }: { definitions: Definition[] }) => {
  const commands = definitions.map((definition: Definition) => {
    const command = definition.value;
    const match = /^([a-z]+(?:-[a-z]+)*)\/([a-z]+(?:-[a-z]+)*)\.js$/u.exec(definition.relativePath);
    if (!match) {
      throw new TypeError(`Command definition must be in one group directory: ${definition.relativePath}`);
    }
    const [, group, commandName] = match;
    return Object.freeze({ ...command, name: commandName, operation: definition.name, group });
  }).sort((left: CommandDefinition, right: CommandDefinition) => left.name.localeCompare(right.name, 'en'));
  return { definitions: Object.freeze(commands) };
};
