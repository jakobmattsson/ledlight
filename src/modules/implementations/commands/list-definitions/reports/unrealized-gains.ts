'use strict';

import type { AggregateRow, CommodityRow } from '../../../../../public-api';
import type { Command } from 'commander';

module.exports = ({ cliOptions: options, core: { appendTotal }, numeric: { decimal: { formatDecimalFixed, parseDecimal } } }: any) => ({
  description: 'show unrealized investment gains',
  examples: [
    'ledlight unrealized-gains --file main.ledger',
    'ledlight unrealized-gains --file main.ledger --to 2024-12-31 --accounts "Assets:*" --include-total',
  ],
  loadFormatData(journal: { commodities(options: { usage: string }): CommodityRow[] }) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command: Command) {
    options.journal(command);
    options.addValue(command, '--to <date>', 'value positions and prices through YYYY-MM-DD');
    options.accounts(command);
    options.dateBasis(command);
    options.format(command);
    options.addBoolean(command, '--include-total', 'append a total gain row to the output', { outputInput: true });
  },
  prepareOutput(rows: AggregateRow[], { includeTotal }: { includeTotal?: boolean }, _format: unknown) {
    return includeTotal ? appendTotal(rows) : rows;
  },
  formatCsv(rows: AggregateRow[], _cliOptions: unknown, { formatCsvTable }: any) {
    return formatCsvTable(['account', 'amount', 'commodity'], rows.map((row: AggregateRow) => [
      row.account,
      formatDecimalFixed(parseDecimal(row.quantity), 2),
      row.commodity,
    ]));
  },
  formatText(rows: AggregateRow[], _cliOptions: unknown, format: any, descriptions: CommodityRow[]) {
    const {
      commodityFormats, displayQuantity, formatAlignedAmounts, parseCommodityFormat,
    } = format;
    const formats = commodityFormats(descriptions);
    return formatAlignedAmounts(rows.map((row: AggregateRow) => ({
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
