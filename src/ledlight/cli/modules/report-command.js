'use strict';

module.exports = ({
  cliCommand: { runReportCommand },
  environment: { currentDirectory },
}) => ({
  run: (arguments_) => runReportCommand(arguments_, {
    startDirectory: currentDirectory(),
  }),
});
