'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show balances over time',
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command) {
    options.journal(command);
    options.date(command, '--from <date>', 'include entries on or after YYYY-MM-DD');
    options.date(command, '--to <date>', 'include entries on or before YYYY-MM-DD');
    options.accounts(command);
    options.dateBasis(command);
    options.valuation(command);
    options.addBoolean(command, '--invert', 'invert the sign of report amounts');
    options.format(command);
  },
  formatCsv(rows, _cliOptions, { csvField, formatDecimalFixed, parseDecimal }) {
    const lines = ['date,amount'];
    for (const row of rows) {
      const fields = [row.date, formatDecimalFixed(parseDecimal(row.amount), 2)];
      lines.push(fields.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows, _cliOptions, { commodityFormats, displayQuantity }, descriptions) {
    const formats = commodityFormats(descriptions);
    const amounts = rows.map((row) =>
      displayQuantity(row.amount, row.commodity, formats, 2, false));
    const amountWidth = Math.max(0, ...amounts.map((amount) => amount.length));
    const lines = rows.map((row, index) =>
      `${row.date}  ${amounts[index].padStart(amountWidth)} ${row.commodity}`);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  },
});
