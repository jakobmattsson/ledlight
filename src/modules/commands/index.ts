'use strict';

type Definition<T extends object> = { name: string; relativePath: string; value: T };
type NamedCommand<T extends object> = Readonly<T & { name: string; operation: string; group: string }>;
type CommandIndex<T extends object> = { definitions: ReadonlyArray<NamedCommand<T>> };

export = <T extends object>({ definitions }: { definitions: Definition<T>[] }): CommandIndex<T> => {
  const commands = definitions.map((definition: Definition<T>): NamedCommand<T> => {
    const command = definition.value;
    const match = /^([a-z]+(?:-[a-z]+)*)\/([a-z]+(?:-[a-z]+)*)\.js$/u.exec(definition.relativePath);
    if (!match) {
      throw new TypeError(`Command definition must be in one group directory: ${definition.relativePath}`);
    }
    const [, group, commandName] = match;
    return Object.freeze({ ...command, name: commandName, operation: definition.name, group });
  }).sort((left: NamedCommand<T>, right: NamedCommand<T>) => left.name.localeCompare(right.name, 'en'));
  return { definitions: Object.freeze(commands) };
};
