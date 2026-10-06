'use strict';

const commands = require('./commands');

module.exports = ({
  reportTotals: { appendTotal },
  decimal: {
    addDecimals,
    formatDecimal,
    formatDecimalFixed,
    parseDecimal,
    compareDecimals,
    divideDecimals,
    divideDecimalsHalfEven,
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
    const match = /^((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d+))?[ \t]+[^ \t]+$/u.exec(format);
    if (!match) return null;
    return {
      decimalSeparator: match[2] ? '.' : null,
      groupingSeparator: match[1].includes(',') ? ',' : null,
      scale: match[2]?.length ?? 0,
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

  function formatPriceQuantity(quantity, commodity, formats) {
    const format = formats.get(commodity);
    if (!format) return quantity;
    const parsedFormat = parseCommodityFormat(format);
    if (!parsedFormat) return quantity;
    const point = quantity.indexOf('.');
    const sourceScale = point < 0 ? 0 : quantity.length - point - 1;
    const scale = Math.max(sourceScale, parsedFormat.scale);
    const fixed = formatDecimalFixed(parseDecimal(quantity), scale);
    const [integer, fraction] = fixed.split('.');
    const grouped = parsedFormat.groupingSeparator === null
      ? integer
      : groupThousands(integer);
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  }

  function displayQuantity(quantity, commodity, formats, fallbackScale) {
    const format = formats.get(commodity);
    if (format) return formatDeclaredQuantity(quantity, format);
    const fallback = fallbackScale === null
      ? quantity
      : formatDecimalFixed(parseDecimal(quantity), fallbackScale);
    return groupThousands(fallback);
  }

  function formatCsv(rows, inValuationCommodity, groupBy) {
    const hasAccounts = groupBy !== 'commodity';
    const lines = [hasAccounts ? 'account,amount,commodity' : 'amount,commodity'];
    for (const row of displayRows(rows, inValuationCommodity)) {
      const fields = hasAccounts
        ? [row.account, row.quantity, row.commodity]
        : [row.quantity, row.commodity];
      lines.push(fields.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function formatHumanReadable(rows, inValuationCommodity, descriptions, groupBy) {
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
    const hasAccounts = groupBy !== 'commodity';
    const commodityWidth = Math.max(0, ...reportRows.map((row) => row.commodity.length));
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
      const commodity = hasAccounts ? row.commodity.padEnd(commodityWidth) : row.commodity;
      const amountColumn = `${integerColumn}${fractionColumn} ${commodity}`;
      if (row.isTotal && !reportRows[index - 1]?.isTotal) {
        lines.push('-'.repeat(amountColumn.length));
      }
      lines.push(hasAccounts ? `${amountColumn}  ${row.account}` : amountColumn);
    });

    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function formatJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  function formatWarnings(warnings) {
    if (warnings.length === 0) return '';
    const lines = [];
    for (const warning of warnings) {
      if (lines.length > 0) lines.push('');
      lines.push(`[${warning.code}] ${warning.message}`);
      for (const instance of warning.instances) {
        const position = instance.column === null
          ? `${instance.source}:${instance.line}`
          : `${instance.source}:${instance.line}:${instance.column}`;
        const affectedLines = instance.startLine === instance.endLine
          ? ''
          : ` (affected lines ${instance.startLine}-${instance.endLine})`;
        lines.push(`  ${position}${affectedLines}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function formatTextTable(rows, columns) {
    const widths = columns.map(({ heading, value }) => Math.max(
      heading.length,
      ...rows.map((row) => String(value(row)).length),
    ));
    const line = (values) => values.map((value, index) => {
      const text = String(value);
      return columns[index].align === 'right'
        ? text.padStart(widths[index])
        : text.padEnd(widths[index]);
    }).join('  ').trimEnd();
    return `${[
      line(columns.map(({ heading }) => heading)),
      line(widths.map((width) => '-'.repeat(width))),
      ...rows.map((row) => line(columns.map(({ value }) => value(row)))),
    ].join('\n')}\n`;
  }

  function formatNameRows(rows, { format }, key) {
    const names = rows.map((row) => row[key]);
    if (format === 'json') return formatJson(names);
    if (format === 'csv') {
      return `${[key, ...names.map(csvField)].join('\n')}\n`;
    }
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  }

  function decimalScale(quantity) {
    const point = quantity.indexOf('.');
    return point < 0 ? 0 : quantity.length - point - 1;
  }

  const shared = {
    addDecimals, commodityFormats, compareDecimals, csvField, decimalScale,
    displayQuantity, divideDecimals, divideDecimalsHalfEven, formatDecimal,
    formatDecimalFixed, formatHumanReadable, formatJson, formatNameRows,
    formatPriceQuantity, formatTextTable, parseCommodityFormat, parseDecimal,
  };
  const commandFormatters = Object.assign({},
    ...commands.map((command) => command.formatters?.(shared) ?? {}));
  return {
    appendTotal,
    formatCsv,
    formatHumanReadable,
    formatJson,
    formatWarnings,
    ...commandFormatters,
    $$private: { parseCommodityFormat },
  };
};
