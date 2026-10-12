'use strict';

module.exports = ({
  core: {
    configuration,
  },
}: any) => {
  function apply(arguments_: any) {
    if (arguments_.some((argument: any) => argument === '--file' || argument.startsWith('--file='))) {
      return arguments_;
    }
    const { journalPath } = configuration.read();
    if (journalPath === undefined || arguments_.length === 0) return arguments_;
    return [arguments_[0], '--file', journalPath, ...arguments_.slice(1)];
  }

  return { apply };
};
