'use strict';

module.exports = ({
  decimal: {
    formatDecimalFixed,
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

  function groupThousands(quantity) {
    const [integer, fraction] = quantity.split('.');
    const negative = integer.startsWith('-');
    const digits = negative ? integer.slice(1) : integer;
    const groupedInteger = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
    return `${negative ? '-' : ''}${groupedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
  }

  function commodityFormats(descriptions) {
    return new Map((descriptions ?? [])
      .filter(({ format }) => format !== null)
      .map(({ commodity, format }) => [commodity, format]));
  }

  function parseCommodityFormat(format) {
    const sample = /\d[\d.,]*/u.exec(format)?.[0];
    if (!sample) return null;
    const commaCount = [...sample].filter((character) => character === ',').length;
    const dotCount = [...sample].filter((character) => character === '.').length;
    let decimalSeparator = null;
    let groupingSeparator = null;
    if (commaCount > 0 && dotCount > 0) {
      decimalSeparator = sample.lastIndexOf(',') > sample.lastIndexOf('.') ? ',' : '.';
      groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    } else {
      const separator = commaCount > 0 ? ',' : dotCount > 0 ? '.' : null;
      const count = commaCount + dotCount;
      if (separator) {
        const segments = sample.split(separator);
        const groupingOnly = count > 1 && segments.slice(1).every((segment) => segment.length === 3) ||
          separator === ',' && count === 1 && segments[0].length <= 3 && segments[1].length === 3;
        if (groupingOnly) groupingSeparator = separator;
        else decimalSeparator = separator;
      }
    }
    return {
      decimalSeparator,
      groupingSeparator,
      scale: decimalSeparator === null ? 0 : sample.length - sample.lastIndexOf(decimalSeparator) - 1,
    };
  }

  function formatDeclaredQuantity(quantity, format) {
    const parsedFormat = parseCommodityFormat(format);
    if (!parsedFormat) return quantity;
    const fixed = formatDecimalFixed(parseDecimal(quantity), parsedFormat.scale);
    const [integer, fraction] = fixed.split('.');
    const negative = integer.startsWith('-');
    const digits = negative ? integer.slice(1) : integer;
    const grouped = parsedFormat.groupingSeparator === null
      ? digits
      : digits.replace(/\B(?=(\d{3})+(?!\d))/gu, parsedFormat.groupingSeparator);
    const decimal = fraction === undefined ? '' : `${parsedFormat.decimalSeparator}${fraction}`;
    return `${negative ? '-' : ''}${grouped}${decimal}`;
  }

  function displayQuantity(quantity, commodity, formats, fallbackScale) {
    const format = formats.get(commodity);
    if (format) return formatDeclaredQuantity(quantity, format);
    const fallback = fallbackScale === null
      ? quantity
      : formatDecimalFixed(parseDecimal(quantity), fallbackScale);
    return groupThousands(fallback);
  }

  function formatCsv(rows, inValuationCommodity) {
    const lines = ['account,amount,commodity'];
    for (const row of displayRows(rows, inValuationCommodity)) {
      lines.push([row.account, row.quantity, row.commodity].map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function formatHumanReadable(rows, inValuationCommodity, descriptions) {
    const formats = commodityFormats(descriptions);
    const reportRows = rows.map((row) => ({
      ...row,
      quantity: displayQuantity(
        row.quantity,
        row.commodity,
        formats,
        inValuationCommodity ? 2 : null,
      ),
    }));
    const accountWidth = Math.max(0, ...reportRows.map((row) => row.account.length));
    const amounts = reportRows.map((row) => {
      const declaredFormat = formats.get(row.commodity);
      const separator = declaredFormat
        ? parseCommodityFormat(declaredFormat)?.decimalSeparator
        : '.';
      const [integer, fraction] = separator === null
        ? [row.quantity, undefined]
        : row.quantity.split(separator);
      return { integer, fraction, separator };
    });
    const integerWidth = Math.max(0, ...amounts.map((amount) => amount.integer.length));
    const fractionWidth = Math.max(0, ...amounts.map((amount) => amount.fraction?.length ?? 0));
    const lines = [];

    reportRows.forEach((row, index) => {
      const { integer, fraction, separator } = amounts[index];
      const integerColumn = integer.padStart(integerWidth);
      const fractionColumn = fractionWidth === 0
        ? ''
        : fraction === undefined
          ? ' '.repeat(fractionWidth + 1)
          : `${separator}${fraction.padEnd(fractionWidth)}`;
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

  function formatBalanceHistoryHumanReadable(rows, descriptions) {
    const formats = commodityFormats(descriptions);
    const amounts = rows.map((row) =>
      displayQuantity(row.amount, row.commodity, formats, 2));
    const amountWidth = Math.max(0, ...amounts.map((amount) => amount.length));
    const lines = rows.map((row, index) =>
      `${row.date}  ${amounts[index].padStart(amountWidth)} ${row.commodity}`);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function formatInvestmentPerformance(report, descriptions) {
    const formats = commodityFormats(descriptions);
    const money = (value) => `${displayQuantity(String(value), report.valuationCommodity, formats, 2)} ${report.valuationCommodity}`;
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
    $$private: { parseCommodityFormat },
  };
};
