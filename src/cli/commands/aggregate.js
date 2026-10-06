'use strict';

const options = require('./options');

module.exports = {
  name: 'aggregate', operation: 'aggregate', group: 'reports',
  description: 'aggregate postings',
  configure(command) {
    options.journal(command);
    options.date(command, '--from <date>', 'include entries on or after YYYY-MM-DD', 'from');
    options.date(command, '--to <date>', 'include entries on or before YYYY-MM-DD', 'to');
    options.accounts(command);
    options.dateBasis(command);
    options.valuation(command);
    options.addValue(command, '--group-by <dimension>', 'group totals by account or commodity', {
      choices: ['account', 'commodity'], defaultValue: 'account', apiInput: 'groupBy',
    });
    options.addBoolean(command, '--value', 'convert amounts to the valuation commodity', 'inValuationCommodity');
    options.addBoolean(command, '--with-valuation-value', 'add the valuation value to commodity rows', 'withValuationValue');
    options.addBoolean(command, '--invert', 'invert the sign of report amounts', 'invert');
    options.addBoolean(command, '--include-total', 'append an exact total for each commodity', 'includeTotal');
    options.format(command);
  },
  parse({ value, withValuationValue, includeTotal, groupBy, format, ...input }) {
    return {
      reportOptions: {
        ...options.reportOptions(input),
        ...options.compact({
          inValuationCommodity: value || undefined,
          withValuationValue: withValuationValue || undefined,
          includeTotal: includeTotal || undefined,
          groupBy,
        }),
      },
      output: { format },
    };
  },
  run({ reportOptions, output }, journal, format) {
    const rows = journal.aggregate(reportOptions);
    if (output.format === 'json') return format.formatJson(rows);
    if (output.format === 'csv') {
      return format.formatCsv(rows, reportOptions.inValuationCommodity, reportOptions.groupBy);
    }
    return format.formatAggregateText(
      rows, reportOptions.inValuationCommodity,
      journal.commodities({ usage: 'all' }), reportOptions.groupBy,
    );
  },
  formatters(shared) {
    const { commodityFormats, displayQuantity, formatHumanReadable, parseDecimal } = shared;

    function formatAggregateText(rows, inValuationCommodity, descriptions, groupBy) {
      if (!inValuationCommodity || groupBy === 'commodity') {
        return formatHumanReadable(rows, inValuationCommodity, descriptions, groupBy);
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
    }

    return { formatAggregateText };
  },
};
