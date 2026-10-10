'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'aggregate postings',
  examples: [
    'ledlight aggregate --file main.ledger',
    'ledlight aggregate --file main.ledger --to 2024-12-31 --accounts "Assets:*" --denominate --include-total',
  ],
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command) {
    options.journal(command);
    options.dateRange(
      command,
      'include activity on or after YYYY-MM-DD',
      'include activity through YYYY-MM-DD; also set the valuation cutoff',
    );
    options.accounts(command);
    options.dateBasis(command);
    options.valuation(command);
    options.addValue(command, '--group-by <dimension>', 'group balances by account or commodity', {
      choices: ['account', 'commodity'],
      defaultValue: 'account',
    });
    options.addBoolean(command, '--denominate', 'convert and combine balances in the journal default commodity');
    options.addBoolean(command, '--with-valuation-value', 'add default-commodity value to each commodity row (excludes --denominate)');
    options.addBoolean(command, '--invert', 'negate reported quantities and valuation values');
    options.addBoolean(command, '--include-total', 'append an exact total per commodity (requires account grouping)');
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
