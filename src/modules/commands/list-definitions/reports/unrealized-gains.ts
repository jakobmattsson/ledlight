'use strict';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show unrealized investment gains',
  examples: [
    'ledlight unrealized-gains --file main.ledger',
    'ledlight unrealized-gains --file main.ledger --to 2024-12-31 --accounts "Assets:*" --include-total',
  ],
  loadFormatData(journal: any) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command: any) {
    options.journal(command);
    options.addValue(command, '--to <date>', 'value positions and prices through YYYY-MM-DD');
    options.accounts(command);
    options.dateBasis(command);
    options.format(command);
    options.addBoolean(command, '--include-total', 'append a total gain row to the output', { outputInput: true });
  },
  prepareOutput(rows: any, { includeTotal }: any, { appendTotal }: any) {
    return includeTotal ? appendTotal(rows) : rows;
  },
  formatCsv(rows: any, _cliOptions: any, { formatCsvTable, formatDecimalFixed, parseDecimal }: any) {
    return formatCsvTable(['account', 'amount', 'commodity'], rows.map((row: any) => [
      row.account,
      formatDecimalFixed(parseDecimal(row.quantity), 2),
      row.commodity,
    ]));
  },
  formatText(rows: any, _cliOptions: any, format: any, descriptions: any) {
    const {
      commodityFormats, displayQuantity, formatAlignedAmounts, parseCommodityFormat,
    } = format;
    const formats = commodityFormats(descriptions);
    return formatAlignedAmounts(rows.map((row: any) => ({
      quantity: displayQuantity(row.quantity, row.commodity, formats, 2),
      commodity: row.commodity,
      label: row.account,
      isTotal: row.isTotal,
      decimalSeparator: formats.has(row.commodity)
        ? parseCommodityFormat(formats.get(row.commodity))?.decimalSeparator
        : '.',
    })), true);
  },
});
