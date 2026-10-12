'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show daily closing totals',
  examples: [
    'ledlight total-history --file main.ledger',
    'ledlight total-history --file main.ledger --from 2024-01-01 --accounts "Assets:*" --format csv',
  ],
  loadFormatData(journal: any) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command: any) {
    options.journal(command);
    options.dateRange(
      command,
      'show daily totals from YYYY-MM-DD; earlier activity still counts',
      'show daily totals through YYYY-MM-DD',
    );
    options.accounts(command);
    options.dateBasis(command);
    options.valuation(command);
    options.addBoolean(command, '--invert', 'negate reported daily totals');
    options.format(command);
  },
  formatCsv(rows: any, _cliOptions: any, { csvField, formatDecimalFixed, parseDecimal }: any) {
    const lines = ['date,amount'];
    for (const row of rows) {
      const fields = [row.date, formatDecimalFixed(parseDecimal(row.amount), 2)];
      lines.push(fields.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows: any, _cliOptions: any, { commodityFormats, displayQuantity }: any, descriptions: any) {
    const formats = commodityFormats(descriptions);
    const amounts = rows.map((row: any) =>
      displayQuantity(row.amount, row.commodity, formats, 2, false));
    const amountWidth = Math.max(0, ...amounts.map((amount: any) => amount.length));
    const lines = rows.map((row: any, index: any) =>
      `${row.date}  ${amounts[index].padStart(amountWidth)} ${row.commodity}`);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  },
});
