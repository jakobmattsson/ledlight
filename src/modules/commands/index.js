'use strict';

module.exports = ({ definitions }) => {
  const commands = definitions.map((definition) => {
    const command = definition.value;
    if (!/^[a-z]+(?:-[a-z]+)*$/u.test(definition.group)) {
      throw new TypeError(`Invalid command group: ${definition.fileName}`);
    }
    return Object.freeze({ ...command, name: definition.commandName, operation: definition.name,
      group: definition.group });
  }).sort((left, right) => left.name.localeCompare(right.name, 'en'));
  return Object.freeze({ definitions: Object.freeze(commands) });
};
