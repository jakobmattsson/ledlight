'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show prices',
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command) {
    options.journal(command);
    options.addValue(command, '--mode <mode>', 'select effective prices or journal price directives', {
      choices: ['effective', 'directives'],
      defaultValue: 'effective',
    });
    options.format(command);
  },
  formatCsv(rows, _cliOptions, { csvField }) {
    const lines = ['date,baseCommodity,quoteQuantity,quoteCommodity,comment'];
    for (const row of rows) {
      lines.push([
        row.date,
        row.baseCommodity,
        row.quoteQuantity,
        row.quoteCommodity,
        row.comment ?? '',
      ].map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  },
  formatText(rows, _cliOptions, format, descriptions) {
    const { commodityFormats, decimalScale, divideDecimalsHalfEven, formatDecimal, formatPriceQuantity, parseCommodityFormat, parseDecimal } = format;

    function ledgerPriceQuantity(row, formats) {
      if (!row.ledgerPrice) return row.quoteQuantity;
      const { totalQuantity, baseQuantity, hasTransactionCost, baseScale, quoteScale } = row.ledgerPrice;
      const commodityScale = parseCommodityFormat(formats.get(row.quoteCommodity))?.scale ?? quoteScale;
      const amountScale = decimalScale(baseQuantity);
      // Ledger 3.3.2 extends divisions by six digits. An inferred purchase
      // divides the balancing totals, caps precision to the quote commodity + 6,
      // then multiplies and divides by the posting quantity during exchange.
      // An explicit @@ price only performs that final division.
      const scale = hasTransactionCost
        ? decimalScale(totalQuantity) + amountScale + 6
        : Math.min(quoteScale + baseScale + 6, commodityScale + 6) + 2 * amountScale + 6;
      const amount = parseDecimal(baseQuantity);
      return formatDecimal(divideDecimalsHalfEven(
        parseDecimal(totalQuantity),
        {
          ...amount,
          coefficient: amount.coefficient < 0n ? -amount.coefficient : amount.coefficient,
        },
        Math.max(scale, commodityScale),
      ));
    }

    const formats = commodityFormats(descriptions);
    const lines = rows.map((row) => {
      const quantity = formatPriceQuantity(ledgerPriceQuantity(row, formats), row.quoteCommodity, formats);
      const amount = `${quantity} ${row.quoteCommodity}`;
      return `${row.date} ${row.baseCommodity.padEnd(8)} ` +
        amount.padStart(12);
    });
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  },
});
