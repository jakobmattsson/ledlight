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
  Time-weighted return (total)
    Use this to compare portfolio performance without the direct effect of
    how much you contributed or withdrew and when. The method splits the
    portfolio history at each external contribution or withdrawal, calculates
    the return in each part, and multiplies the parts' growth factors. Ledlight
    uses daily closing values and treats flows as occurring at day's end.

  Time-weighted return (annualized)
    Use this to compare time-weighted returns across periods of different
    lengths. It is the yearly compound rate implied by the time-weighted
    return from the first invested day to the report end, or to the day the
    portfolio last reaches zero.

  Money-weighted return (total)
    Use this to see your own cumulative return, including how much you
    contributed or withdrew and when. It is the annualized XIRR compounded
    over the interval from the first to the last non-zero investor cash flow.

  Money-weighted return (annualized)
    Use this to compare your own returns across periods of different lengths.
    The yearly compound rate (XIRR) that makes the present value of the dated
    opening value, contributions, withdrawals, and ending value equal zero.`,
  configure(command) {
    options.journal(command);
    options.dateRange(
      command,
      'start the return period on YYYY-MM-DD; earlier holdings form opening value',
      'end the return period on YYYY-MM-DD',
    );
    options.accounts(command);
    options.addValue(command, '--commodities <pattern>', 'select commodity symbols (repeatable; ^ and $ anchor, ~ excludes)', {
      repeatable: true,
    });
    options.format(command);
  },
  formatCsv(report, _cliOptions, { csvField }) {
    const fields = [
      'from', 'to', 'commodities', 'valuationCommodity', 'openingValue',
      'endingValue', 'netContributions', 'profitLoss', 'timeWeightedReturn',
      'timeWeightedReturnAnnualized',
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
      `Time-weighted return (total): ${percent(report.timeWeightedReturn)}`,
      `Time-weighted return (annualized): ${percent(report.timeWeightedReturnAnnualized)}`,
      `Money-weighted return (total): ${percent(report.moneyWeightedReturnTotal)}`,
      `Money-weighted return (annualized): ${percent(report.moneyWeightedReturn)}`,
    ].join('\n') + '\n';
  },
});
