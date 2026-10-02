'use strict';

module.exports = ({
  ledlight: {
    openProject,
    version,
  },
  cliArguments: { parseArguments, usage },
  cliFormat: {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatInvestmentPerformanceJson,
  },
}) => {

  function runReportCommand(arguments_, { startDirectory }) {
    if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
      return `${usage()}\n`;
    }
    if (arguments_.length === 1 && arguments_[0] === '--version') return `${version}\n`;
    const [command] = arguments_;
    if (command === 'investment-performance') {
      const { reportOptions, json } = parseArguments(arguments_);
      const project = openProject(startDirectory);
      const report = project.investmentPerformance(reportOptions);
      return json
        ? formatInvestmentPerformanceJson(report)
        : formatInvestmentPerformance(report, project.commodityDescriptions());
    }

    const { reportOptions, csv } = parseArguments(arguments_);
    const project = openProject(startDirectory);
    if (command === 'balance-history') {
      const reportRows = project.balanceHistoryReport(reportOptions);
      return csv
        ? formatBalanceHistoryCsv(reportRows)
        : formatBalanceHistoryHumanReadable(reportRows, project.commodityDescriptions());
    }
    const reportRows = project.aggregateReport({
      ...reportOptions,
      includeTotal: !csv && reportOptions.inValuationCommodity,
    });
    return csv
      ? formatCsv(reportRows, reportOptions.inValuationCommodity)
      : formatHumanReadable(
        reportRows,
        reportOptions.inValuationCommodity,
        project.commodityDescriptions(),
      );
  }

  return { runReportCommand };
};
