'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show investment performance',
  examples: [
    'ledlight investment-performance --file main.ledger',
    'ledlight investment-performance --file main.ledger --from 2024-01-01 --to 2024-12-31 --accounts "^Assets:Broker"',
  ],
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  helpDetails: `Return measures:
  Time-weighted return
    Split the portfolio history at each external contribution or withdrawal.
    Calculate the return in each part and multiply the parts' growth factors.
    Ledlight uses daily closing values and treats flows as occurring at day's
    end.

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
    options.dateRange(
      command,
      'start the return period on YYYY-MM-DD; earlier holdings form opening value',
      'end the return period on YYYY-MM-DD',
    );
    options.accounts(command);
    options.addValue(command, '--commodities <name>', 'include an exact commodity symbol (repeatable; default: discover from holdings)', {
      repeatable: true,
    });
    options.addValue(command, '--exclude-commodities <name>', 'exclude an exact commodity symbol (repeatable)', {
      repeatable: true,
    });
    options.format(command);
  },
  formatCsv(report, _cliOptions, { csvField }) {
    const fields = [
      'from', 'to', 'commodities', 'valuationCommodity', 'openingValue',
      'endingValue', 'netContributions', 'profitLoss', 'timeWeightedReturn',
      'moneyWeightedReturn', 'moneyWeightedReturnTotal', 'points',
    ];
    const value = (field) => {
      const fieldValue = report[field];
      if (fieldValue === null || fieldValue === undefined) return '';
      return Array.isArray(fieldValue) ? JSON.stringify(fieldValue) : fieldValue;
    };
    return `${fields.join(',')}\n${fields.map((field) => csvField(value(field))).join(',')}\n`;
  },
  formatText(report, _cliOptions, { commodityFormats, displayQuantity }, descriptions) {
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
  },
});
