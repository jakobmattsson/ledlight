'use strict';

module.exports = ({ configuration }) => {
  function apply(arguments_) {
    if (arguments_.some((argument) => argument === '--file' || argument.startsWith('--file='))) {
      return arguments_;
    }
    const { journalPath } = configuration.read();
    if (journalPath === undefined || arguments_.length === 0) return arguments_;
    return [arguments_[0], '--file', journalPath, ...arguments_.slice(1)];
  }

  return { apply };
};
