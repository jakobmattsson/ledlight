'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'aggregate postings',
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
    options.addValue(command, '--group-by <dimension>', 'group totals by account or commodity', {
      choices: ['account', 'commodity'],
      defaultValue: 'account',
    });
    options.addBoolean(command, '--denominate', 'denominate and combine amounts in the journal default currency');
    options.addBoolean(command, '--with-valuation-value', 'add the valuation value to commodity rows');
    options.addBoolean(command, '--invert', 'invert the sign of report amounts');
    options.addBoolean(command, '--include-total', 'append an exact total for each commodity');
    options.format(command);
  },
  formatCsv(rows, { denominate, groupBy }, format) {
    const { formatCsvTable, formatDecimalFixed, parseDecimal } = format;
    const showAccounts = groupBy !== 'commodity';
    const headings = showAccounts ? ['account', 'amount', 'commodity'] : ['amount', 'commodity'];
    return formatCsvTable(headings, rows.map((row) => {
      const quantity = denominate ? formatDecimalFixed(parseDecimal(row.quantity), 2) : row.quantity;
      return showAccounts
        ? [row.account, quantity, row.commodity]
        : [quantity, row.commodity];
    }));
  },
  formatText(rows, { denominate, groupBy }, format, descriptions) {
    const {
      commodityFormats, displayQuantity, formatAlignedAmounts, parseCommodityFormat, parseDecimal,
    } = format;
    if (!denominate || groupBy === 'commodity') {
      const formats = commodityFormats(descriptions);
      return formatAlignedAmounts(rows.map((row) => ({
        quantity: displayQuantity(row.quantity, row.commodity, formats, denominate ? 2 : null),
        commodity: row.commodity,
        label: row.account,
        isTotal: row.isTotal,
        decimalSeparator: formats.has(row.commodity)
          ? parseCommodityFormat(formats.get(row.commodity))?.decimalSeparator
          : '.',
      })), groupBy !== 'commodity');
    }
    const formats = commodityFormats(descriptions);
    const lines = [];
    for (const row of rows) {
      const quantity = displayQuantity(row.quantity, row.commodity, formats, 2);
      const amount = parseDecimal(quantity.replaceAll(',', '')).coefficient === 0n
        ? '0'
        : `${quantity} ${row.commodity}`;
      if (row.isTotal) lines.push('-'.repeat(20));
      lines.push(row.isTotal ? amount.padStart(20) : `${amount.padStart(20)}  ${row.account}`);
    }
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  },
});
