'use strict';

const options = require('./options');

module.exports = {
  name: 'unrealized-gains', operation: 'unrealizedGains', group: 'reports',
  description: 'show unrealized investment gains',
  configure(command) {
    options.journal(command);
    options.date(command, '--to <date>', 'include positions and prices on or before YYYY-MM-DD', 'to');
    options.accounts(command);
    options.dateBasis(command);
    options.format(command);
    options.addBoolean(command, '--include-total', 'append the total gain', 'includeTotal', 'outputInput');
  },
  parse({ format, includeTotal, ...input }) {
    return {
      reportOptions: options.reportOptions(input),
      output: { format, includeTotal: includeTotal || false },
    };
  },
  run({ reportOptions, output }, journal, format) {
    const reportRows = journal.unrealizedGains(reportOptions);
    const rows = output.includeTotal ? format.appendTotal(reportRows) : reportRows;
    if (output.format === 'json') return format.formatJson(rows);
    if (output.format === 'csv') return format.formatCsv(rows, true);
    return format.formatHumanReadable(rows, true, journal.commodities({ usage: 'all' }));
  },
};
