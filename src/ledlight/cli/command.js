'use strict';

module.exports = ({
  ledlight: {
    aggregateReport,
    balanceHistoryReport,
    investmentPerformance,
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
      const report = investmentPerformance(reportOptions, startDirectory);
      return json
        ? formatInvestmentPerformanceJson(report)
        : formatInvestmentPerformance(report);
    }

    const { reportOptions, csv } = parseArguments(arguments_);
    if (command === 'balance-history') {
      const reportRows = balanceHistoryReport(reportOptions, startDirectory);
      return csv
        ? formatBalanceHistoryCsv(reportRows)
        : formatBalanceHistoryHumanReadable(reportRows);
    }
    const reportRows = aggregateReport({
      ...reportOptions,
      includeTotal: !csv && reportOptions.inValuationCommodity,
    }, startDirectory);
    return csv
      ? formatCsv(reportRows, reportOptions.inValuationCommodity)
      : formatHumanReadable(reportRows, reportOptions.inValuationCommodity);
  }

  return { runReportCommand };
};
