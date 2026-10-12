'use strict';

module.exports = ({
  core: {
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
  },
}: any) => {

  function csvField(value: any) {
    const text = String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function groupThousands(quantity: any) {
    const [integer, fraction] = quantity.split('.');
    const negative = integer.startsWith('-');
    const digits = negative ? integer.slice(1) : integer;
    const groupedInteger = digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
    return `${negative ? '-' : ''}${groupedInteger}${fraction === undefined ? '' : `.${fraction}`}`;
  }

  function commodityFormats(descriptions: any) {
    return new Map((descriptions ?? [])
      .filter(({ format }: any) => format !== null)
      .map(({ commodity, format }: any) => [commodity, format]));
  }

  function parseCommodityFormat(format: any) {
    const match = /^((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d+))?[ \t]+[^ \t]+$/u.exec(format);
    if (!match) return null;
    return {
      decimalSeparator: match[2] ? '.' : null,
      groupingSeparator: match[1].includes(',') ? ',' : null,
      scale: match[2]?.length ?? 0,
    };
  }

  function formatDeclaredQuantity(quantity: any, format: any) {
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

  function formatPriceQuantity(quantity: any, commodity: any, formats: any) {
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

  function displayQuantity(quantity: any, commodity: any, formats: any, fallbackScale: any) {
    const format = formats.get(commodity);
    if (format) return formatDeclaredQuantity(quantity, format);
    const fallback = fallbackScale === null
      ? quantity
      : formatDecimalFixed(parseDecimal(quantity), fallbackScale);
    return groupThousands(fallback);
  }

  function formatCsvTable(headings: any, rows: any) {
    const lines = [headings.map(csvField).join(',')];
    for (const row of rows) lines.push(row.map(csvField).join(','));
    return `${lines.join('\n')}\n`;
  }

  function formatAlignedAmounts(rows: any, showLabels: any) {
    const commodityWidth = Math.max(0, ...rows.map((row: any) => row.commodity.length));
    const amounts = rows.map((row: any) => {
      const [integer, fraction] = row.decimalSeparator === null
        ? [row.quantity, undefined]
        : row.quantity.split(row.decimalSeparator);
      return { integer, fraction, separator: row.decimalSeparator };
    });
    const integerWidth = Math.max(0, ...amounts.map((amount: any) => amount.integer.length));
    const fractionWidth = Math.max(0, ...amounts.map((amount: any) => amount.fraction?.length ?? 0));
    const lines: any = [];

    rows.forEach((row: any, index: any) => {
      const { integer, fraction, separator } = amounts[index];
      const integerColumn = integer.padStart(integerWidth);
      const fractionColumn = fractionWidth === 0
        ? ''
        : fraction === undefined
          ? ' '.repeat(fractionWidth + 1)
          : `${separator}${fraction.padEnd(fractionWidth)}`;
      const commodity = showLabels ? row.commodity.padEnd(commodityWidth) : row.commodity;
      const amountColumn = `${integerColumn}${fractionColumn} ${commodity}`;
      if (row.isTotal && !rows[index - 1]?.isTotal) {
        lines.push('-'.repeat(amountColumn.length));
      }
      lines.push(showLabels ? `${amountColumn}  ${row.label}` : amountColumn);
    });

    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function formatJson(value: any) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  function formatWarnings(warnings: any) {
    if (warnings.length === 0) return '';
    const lines: any = [];
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

  function formatTextTable(rows: any, columns: any) {
    const widths = columns.map(({ heading, value }: any) => Math.max(
      heading.length,
      ...rows.map((row: any) => String(value(row)).length),
    ));
    const line = (values: any) => values.map((value: any, index: any) => {
      const text = String(value);
      return columns[index].align === 'right'
        ? text.padStart(widths[index])
        : text.padEnd(widths[index]);
    }).join('  ').trimEnd();
    return `${[
      line(columns.map(({ heading }: any) => heading)),
      line(widths.map((width: any) => '-'.repeat(width))),
      ...rows.map((row: any) => line(columns.map(({ value }: any) => value(row)))),
    ].join('\n')}\n`;
  }

  function decimalScale(quantity: any) {
    const point = quantity.indexOf('.');
    return point < 0 ? 0 : quantity.length - point - 1;
  }

  const shared: any = {
    addDecimals, commodityFormats, compareDecimals, csvField, decimalScale, formatCsvTable,
    displayQuantity, divideDecimals, divideDecimalsHalfEven, formatDecimal,
    formatDecimalFixed, formatAlignedAmounts, formatJson,
    formatPriceQuantity, formatTextTable, parseCommodityFormat, parseDecimal,
  };
  return {
    ...shared,
    appendTotal,
    formatWarnings,
    $$private: { parseCommodityFormat },
  };
};
