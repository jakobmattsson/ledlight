'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show daily closing totals',
  examples: [
    'ledlight total-history --file main.ledger',
    'ledlight total-history --file main.ledger --from 2024-01-01 --accounts "^Assets:" --format csv',
  ],
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command) {
    options.journal(command);
    options.fromDate(command, 'show daily totals from YYYY-MM-DD; earlier activity still counts');
    options.toDate(command, 'show daily totals through YYYY-MM-DD');
    options.accounts(command);
    options.dateBasis(command);
    options.valuation(command);
    options.addBoolean(command, '--invert', 'negate reported daily totals');
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
