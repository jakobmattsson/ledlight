'use strict';

module.exports = ({
  cliCommand: { runReportCommand },
  environment: { currentDirectory },
}) => ({
  run: (arguments_) => runReportCommand(arguments_, {
    project: undefined,
    startDirectory: currentDirectory(),
  }),
});
