'use strict';

module.exports = ({
  srcLedlightCliCommand: { runReportCommand },
  environment: { currentDirectory },
}) => ({
  run: (arguments_) => runReportCommand(arguments_, {
    project: undefined,
    startDirectory: currentDirectory(),
  }),
});
