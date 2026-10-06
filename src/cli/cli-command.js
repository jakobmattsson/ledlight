'use strict';

module.exports = ({
  project,
  cliStdinJournal,
  packageMetadata: { version },
  cliArguments: { parseArguments, usage },
  cliFormat: {
    appendTotal,
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatAggregateText,
    formatInvestmentPerformance,
    formatTransactions,
    formatJson,
    formatAccounts,
    formatCommodities,
    formatPrices,
    formatPostings,
    formatTags,
  },
}) => {

  let lastWarnings = [];

  function runJsonCommand(parsed, journal) {
    const { command, options } = parsed;
    if (command === 'accounts') {
      return formatAccounts(journal.accounts(options), parsed.output);
    }
    if (command === 'tags') return formatTags(journal.tags(options), parsed.output);
    if (command === 'commodities') {
      return formatCommodities(journal.commodities(options), parsed.output);
    }
    if (command === 'prices') {
      const descriptions = parsed.output.format === 'text'
        ? journal.commodities({ usage: 'all' })
        : undefined;
      return formatPrices(journal.prices(options), parsed.output, descriptions);
    }
    if (command === 'transactions') {
      const descriptions = parsed.output.format === 'text'
        ? journal.commodities({ usage: 'all' })
        : undefined;
      if (parsed.output.format === 'text' &&
          options.page === undefined && options.pageSize === undefined) {
        const firstPage = journal.transactions(options);
        const transactions = [...firstPage.transactions];
        for (let page = 2; page <= firstPage.totalPages; page += 1) {
          transactions.push(...journal.transactions({
            ...options, page, pageSize: 100,
          }).transactions);
        }
        return formatTransactions({ ...firstPage, transactions }, parsed.output, descriptions);
      }
      return formatTransactions(
        journal.transactions(options), parsed.output, descriptions,
      );
    }
    if (command === 'postings') {
      return formatPostings(journal.postings(options), parsed.output);
    }
    throw new Error(`Unsupported command: ${command}`);
  }

  function runReport(parsed, journal) {
    const { command, reportOptions, output } = parsed;
    if (command === 'investment-performance') {
      const report = journal.investmentPerformance(reportOptions);
      return output.json
        ? formatJson(report)
        : formatInvestmentPerformance(report, journal.commodities({ usage: 'all' }));
    }
    if (command === 'unrealized-gains') {
      const reportRows = journal.unrealizedGains(reportOptions);
      const rows = output.includeTotal ? appendTotal(reportRows) : reportRows;
      if (output.format === 'json') return formatJson(rows);
      return output.format === 'csv'
        ? formatCsv(rows, true)
        : formatHumanReadable(rows, true, journal.commodities({ usage: 'all' }));
    }
    if (command === 'balance-history') {
      const rows = journal.balanceHistoryReport(reportOptions);
      if (output.format === 'json') return formatJson(rows);
      return output.format === 'csv'
        ? formatBalanceHistoryCsv(rows)
        : formatBalanceHistoryHumanReadable(rows, journal.commodities({ usage: 'all' }));
    }
    const rows = journal.aggregate(reportOptions);
    if (output.format === 'json') return formatJson(rows);
    return output.format === 'csv'
      ? formatCsv(rows, reportOptions.inValuationCommodity, reportOptions.groupBy)
      : formatAggregateText(
        rows,
        reportOptions.inValuationCommodity,
        journal.commodities({ usage: 'all' }),
        reportOptions.groupBy,
      );
  }

  function runReportCommand(arguments_, stdinSource) {
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
    const run = (journal) => {
      lastWarnings = journal.warnings || [];
      return [
        'aggregate',
        'balance-history',
        'unrealized-gains',
        'investment-performance',
      ].includes(parsed.command)
        ? runReport(parsed, journal)
        : runJsonCommand(parsed, journal);
    };
    return parsed.journalPath === '-'
      ? cliStdinJournal.withJournal(stdinSource, run)
      : run(project.openJournal(parsed.journalPath));
  }

  function runReportCommandWithWarnings(arguments_, stdinSource) {
    lastWarnings = [];
    const output = runReportCommand(arguments_, stdinSource);
    return { output, warnings: lastWarnings };
  }

  return { runReportCommand, runReportCommandWithWarnings };
};
