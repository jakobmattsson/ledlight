'use strict';

const options = require('./options');

module.exports = {
  name: 'investment-performance', operation: 'investmentPerformance', group: 'reports',
  description: 'show investment performance',
  helpDetails: `Return measures:
  Time-weighted return
    The compounded daily investment return after removing each day's net
    external cash flow from its closing value. Cash flows are treated as
    occurring at the end of the day, so their amount and timing do not affect
    the measured investment performance.

  Money-weighted return (total)
    The cumulative investor return accounting for the amount and date of the
    opening value, contributions, withdrawals, and ending value. It is the
    annualized XIRR compounded over the interval from the first to the last
    non-zero investor cash flow.

  Money-weighted return (annualized)
    The yearly compound rate (XIRR) that makes the present value of the dated
    opening value, contributions, withdrawals, and ending value equal zero.
    It allows periods of different lengths to be compared.`,
  configure(command) {
    options.journal(command);
    options.date(command, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    options.date(command, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    options.accounts(command);
    options.addValue(command, '--commodities <name>', 'include a commodity (repeatable)', {
      repeatable: true, apiInput: 'commodities',
    });
    options.addValue(command, '--exclude-commodities <name>', 'exclude a commodity (repeatable)', {
      repeatable: true, apiInput: 'excludeCommodities',
    });
    options.json(command);
  },
  parse({ commodities, excludeCommodities, json, ...input }) {
    return {
      reportOptions: {
        ...options.reportOptions(input),
        commodities: commodities || [], excludeCommodities: excludeCommodities || [],
      },
      output: { csv: false, json: json || false },
    };
  },
  run({ reportOptions, output }, journal, format) {
    const report = journal.investmentPerformance(reportOptions);
    return output.json
      ? format.formatJson(report)
      : format.formatInvestmentPerformance(report, journal.commodities({ usage: 'all' }));
  },
  formatters(shared) {
    const { commodityFormats, displayQuantity } = shared;

    function formatInvestmentPerformance(report, descriptions) {
      const formats = commodityFormats(descriptions);
      const money = (value) => `${displayQuantity(
        String(value), report.valuationCommodity, formats, 2, false,
      )} ${report.valuationCommodity}`;
      const percent = (value) => value === null ? 'n/a' : `${(value * 100).toFixed(2)} %`;
      return [
        `Investment performance from ${report.from ?? 'n/a'} to ${report.to ?? 'n/a'}`,
        `Instruments: ${report.commodities.length}`,
        `Opening value: ${money(report.openingValue)}`,
        `Net contributions: ${money(report.netContributions)}`,
        `Ending value: ${money(report.endingValue)}`,
        `Profit/loss: ${money(report.profitLoss)}`,
        `Time-weighted return: ${percent(report.timeWeightedReturn)}`,
        `Money-weighted return (total): ${percent(report.moneyWeightedReturnTotal)}`,
        `Money-weighted return (annualized): ${percent(report.moneyWeightedReturn)}`,
      ].join('\n') + '\n';
    }

    function formatInvestmentPerformanceJson(report) {
      return `${JSON.stringify(report, null, 2)}\n`;
    }

    return { formatInvestmentPerformance, formatInvestmentPerformanceJson };
  },
};
