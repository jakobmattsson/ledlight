'use strict';

module.exports = ({
  project,
  packageMetadata: { version },
  cliArguments: { parseArguments, usage },
  cliFormat: {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatJson,
    formatAccounts,
  },
}) => {

  let lastWarnings = [];

  function runJsonCommand(parsed) {
    const { command, journalPath, options } = parsed;
    const journal = project.openJournal(journalPath);
    lastWarnings = journal.warnings || [];
    if (command === 'account-balances') return formatJson(journal.accountBalances(options));
    if (command === 'account-postings') return formatJson(journal.accountPostings(options));
    if (command === 'account-transactions') return formatJson(journal.accountTransactions(options));
    if (command === 'commodity-descriptions') return formatJson(journal.commodityDescriptions());
    if (command === 'accounts') {
      return formatAccounts(journal.accounts(), parsed.output);
    }
    if (command === 'ledger-transaction') return formatJson(journal.ledgerTransaction(options));
    if (command === 'ledger-transactions') return formatJson(journal.ledgerTransactions(options));
    if (command === 'reconciliation-entries') {
      return formatJson(journal.reconciliationEntries(options));
    }
    if (command === 'valuation-rate') {
      return formatJson(journal.ledgerValuationRateResolver()(options.commodity, options.throughDate));
    }
    throw new Error(`Unsupported command: ${command}`);
  }

  function runReport(parsed) {
    const { command, reportOptions, journalPath, output } = parsed;
    const journal = project.openJournal(journalPath);
    lastWarnings = journal.warnings || [];
    if (command === 'investment-performance') {
      const report = journal.investmentPerformance(reportOptions);
      return output.json
        ? formatJson(report)
        : formatInvestmentPerformance(report, journal.commodityDescriptions());
    }
    if (command === 'gain') {
      const rows = journal.gainReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatCsv(rows, true)
        : formatHumanReadable(rows, true, journal.commodityDescriptions());
    }
    if (command === 'balance-history') {
      const rows = journal.balanceHistoryReport(reportOptions);
      if (output.json) return formatJson(rows);
      return output.csv
        ? formatBalanceHistoryCsv(rows)
        : formatBalanceHistoryHumanReadable(rows, journal.commodityDescriptions());
    }
    const aggregateOptions = {
      ...reportOptions,
      includeTotal: reportOptions.includeTotal ??
        (!output.csv && !output.json && reportOptions.inValuationCommodity),
    };
    const rows = journal.aggregateReport(aggregateOptions);
    if (output.json) return formatJson(rows);
    return output.csv
      ? formatCsv(rows, reportOptions.inValuationCommodity)
      : formatHumanReadable(
        rows,
        reportOptions.inValuationCommodity,
        journal.commodityDescriptions(),
      );
  }

  function runReportCommand(arguments_) {
    if (arguments_.length === 0 ||
        (arguments_.length === 1 && arguments_[0] === '--help')) {
      return `${usage()}\n`;
    }
    if (arguments_.length === 1 && arguments_[0] === '--version') {
      return `${version}\n`;
    }
    if (arguments_.length >= 2 && arguments_.slice(1).includes('--help')) {
      return `${usage(arguments_[0])}\n`;
    }
    const parsed = parseArguments(arguments_);
    return ['aggregate', 'balance-history', 'gain', 'investment-performance'].includes(parsed.command)
      ? runReport(parsed)
      : runJsonCommand(parsed);
  }

  function runReportCommandWithWarnings(arguments_) {
    lastWarnings = [];
    const output = runReportCommand(arguments_);
    return { output, warnings: lastWarnings };
  }

  return { runReportCommand, runReportCommandWithWarnings };
};
