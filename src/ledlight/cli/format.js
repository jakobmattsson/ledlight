'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    formatDecimal,
    formatDecimalFixed,
    negateDecimal,
    parseDecimal,
  },
}) => {

  function csvField(value) {
    const text = String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function displayRows(rows, inValuationCommodity) {
    return rows.map((row) => ({
      ...row,
      quantity: inValuationCommodity ? formatDecimalFixed(parseDecimal(row.quantity), 2) : row.quantity,
    }));
  }

  function invertRows(rows) {
    return rows.map((row) => ({
      ...row,
      quantity: formatDecimal(negateDecimal(parseDecimal(row.quantity))),
    }));
  }

  function withTotal(rows) {
    if (rows.length === 0) return rows;
    const total = rows.reduce(
      (sum, row) => addDecimals(sum, parseDecimal(row.quantity)),
      parseDecimal('0'),
    );
    return [
      ...rows,
      {
        account: 'Total',
        commodity: rows[0].commodity,
        isTotal: true,
        quantity: formatDecimal(total),
      },
    ];
  }

  function groupThousands(quantity) {
    const [integer, fraction] = quantity.split('.');
    const negative = integer.startsWith('-');
    const digits = negative ? integer.slice(1) : integer;
    const groupedInteger = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
    return `${negative ? '-' : ''}${groupedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
  }

  function formatCsv(rows, inValuationCommodity) {
    const lines = ['account,amount,commodity'];
    for (const row of displayRows(rows, inValuationCommodity)) {
      lines.push([row.account, row.quantity, row.commodity].map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function formatHumanReadable(rows, inValuationCommodity) {
    const reportRows = displayRows(
      inValuationCommodity ? withTotal(rows) : rows,
      inValuationCommodity,
    );
    const accountWidth = Math.max(0, ...reportRows.map((row) => row.account.length));
    const amounts = reportRows.map((row) => {
      const [integer, fraction] = groupThousands(row.quantity).split('.');
      return { integer, fraction };
    });
    const integerWidth = Math.max(0, ...amounts.map((amount) => amount.integer.length));
    const fractionWidth = Math.max(0, ...amounts.map((amount) => amount.fraction?.length ?? 0));
    const lines = [];

    reportRows.forEach((row, index) => {
      const { integer, fraction } = amounts[index];
      const integerColumn = integer.padStart(integerWidth);
      const fractionColumn = fractionWidth === 0
        ? ''
        : fraction === undefined
          ? ' '.repeat(fractionWidth + 1)
          : `.${fraction.padEnd(fractionWidth)}`;
      const line = `${row.account.padStart(accountWidth)}  ` +
      `${integerColumn}${fractionColumn} ${row.commodity}`;
      if (row.isTotal) {
        const separatorIndent = accountWidth - row.account.length;
        lines.push(`${' '.repeat(separatorIndent)}${'-'.repeat(line.length - separatorIndent)}`);
      }
      lines.push(line);
    });

    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function displayBalanceHistory(rows) {
    return rows.map((row) => ({
      ...row,
      amount: formatDecimalFixed(parseDecimal(row.amount), 2),
    }));
  }

  function formatBalanceHistoryCsv(rows) {
    const lines = ['date,amount'];
    for (const row of displayBalanceHistory(rows)) lines.push(`${csvField(row.date)},${row.amount}`);
    return `${lines.join('\n')}\n`;
  }

  function formatBalanceHistoryHumanReadable(rows) {
    const reportRows = displayBalanceHistory(rows);
    const amounts = reportRows.map((row) => groupThousands(row.amount));
    const amountWidth = Math.max(0, ...amounts.map((amount) => amount.length));
    const lines = reportRows.map((row, index) =>
      `${row.date}  ${amounts[index].padStart(amountWidth)} ${row.commodity}`);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function invertBalanceHistory(rows) {
    return rows.map((row) => ({
      ...row,
      amount: formatDecimal(negateDecimal(parseDecimal(row.amount))),
    }));
  }

  function formatInvestmentPerformance(report) {
    const money = (value) => `${groupThousands(value.toFixed(2))} ${report.valuationCommodity}`;
    const percent = (value) => value === null ? 'n/a' : `${(value * 100).toFixed(2)} %`;
    return [
      `Investment performance from ${report.from ?? 'n/a'} to ${report.to ?? 'n/a'}`,
      `Instruments: ${report.commodities.length}`,
      `Opening value: ${money(report.openingValue)}`,
      `Net contributions: ${money(report.netContributions)}`,
      `Ending value: ${money(report.endingValue)}`,
      `Profit/loss: ${money(report.profitLoss)}`,
      `Time-weighted return: ${percent(report.timeWeightedReturn)}`,
      `Money-weighted return (total): ${percent(report.moneyWeightedReturnTotal)}`,
      `Money-weighted return (annualized): ${percent(report.moneyWeightedReturn)}`,
    ].join('\n') + '\n';
  }

  function formatInvestmentPerformanceJson(report) {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return {
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatInvestmentPerformanceJson,
    invertBalanceHistory,
    invertRows,
  };
};
