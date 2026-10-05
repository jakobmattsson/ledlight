'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    formatDecimal,
    formatDecimalFixed,
    parseDecimal,
    compareDecimals,
    divideDecimals,
  },
}) => {

  function appendTotal(rows) {
    if (rows.length === 0) return rows;
    const quantity = rows.reduce(
      (sum, row) => addDecimals(sum, parseDecimal(row.quantity)),
      parseDecimal('0'),
    );
    return [...rows, {
      account: 'Total',
      quantity: formatDecimal(quantity),
      commodity: rows[0].commodity,
      isTotal: true,
    }];
  }

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
      if (row.isTotal) {
        lines.push('-'.repeat(amountColumn.length));
      }
      lines.push(hasAccounts ? `${amountColumn}  ${row.account}` : amountColumn);
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
    for (const row of displayBalanceHistory(rows)) {
      const fields = [row.date, row.amount];
      lines.push(fields.map(csvField).join(','));
    }
    return `${lines.join('\n')}\n`;
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

  function formatAccounts(rows, { details, format }) {
    const accountNames = rows.map(({ account }) => account);
    const selectedRows = details ? rows : accountNames;
    if (format === 'json') return formatJson(selectedRows);
    if (format === 'csv') {
      const lines = [details ? 'account,comment,transactionCount' : 'account'];
      for (const row of rows) {
        const values = details
          ? [row.account, row.comment ?? '', row.transactionCount]
          : [row.account];
        lines.push(values.map(csvField).join(','));
      }
      return `${lines.join('\n')}\n`;
    }
    if (!details) return accountNames.length === 0 ? '' : `${accountNames.join('\n')}\n`;
    return formatTextTable(rows, [
      { heading: 'Transactions', value: (row) => row.transactionCount, align: 'right' },
      { heading: 'Account', value: (row) => row.account },
      { heading: 'Comment', value: (row) => row.comment ?? '' },
    ]);
  }

  function formatNameRows(rows, { format }, key) {
    const names = rows.map((row) => row[key]);
    if (format === 'json') return formatJson(names);
    if (format === 'csv') {
      return `${[key, ...names.map(csvField)].join('\n')}\n`;
    }
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  }

  const formatTags = (rows, output) => formatNameRows(rows, output, 'tag');
  function formatCommodities(rows, { details, format }) {
    if (!details) return formatNameRows(rows, { format }, 'commodity');
    if (format === 'json') return formatJson(rows);
    if (format === 'csv') {
      const lines = ['commodity,comment,format,isDefault,used'];
      for (const row of rows) {
        lines.push([
          row.commodity,
          row.comment ?? '',
          row.format ?? '',
          row.isDefault,
          row.used,
        ].map(csvField).join(','));
      }
      return `${lines.join('\n')}\n`;
    }
    return formatTextTable(rows, [
      { heading: 'Commodity', value: (row) => row.commodity },
      { heading: 'Default', value: (row) => row.isDefault ? 'yes' : '' },
      { heading: 'Used', value: (row) => row.used ? 'yes' : '' },
      { heading: 'Format', value: (row) => row.format ?? '' },
      { heading: 'Comment', value: (row) => row.comment ?? '' },
    ]);
  }

  function formatPrices(rows, { format }, descriptions) {
    if (format === 'json') return formatJson(rows);
    if (format === 'csv') {
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
    }
    const formats = commodityFormats(descriptions);
    const lines = rows.map((row) => {
      const quantity = formatPriceQuantity(row.quoteQuantity, row.quoteCommodity, formats);
      const amount = `${quantity} ${row.quoteCommodity}`;
      return `${row.date} ${row.baseCommodity.padEnd(8)} ` +
        amount.padStart(12);
    });
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function transactionRows(report) {
    return report.transactions.flatMap((transaction) =>
      transaction.postings.flatMap((posting) => posting.amounts.map((amount) => ({
        transactionId: transaction.transactionId,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        transactionComment: transaction.comment ?? '',
        postingDate: posting.postingDate,
        account: posting.account,
        postingComment: posting.comment ?? '',
        quantity: amount.quantity,
        commodity: amount.commodity,
      }))));
  }

  function formatTransactionsCsv(report) {
    const fields = [
      'transactionId', 'transactionDate', 'description', 'transactionComment',
      'postingDate', 'account', 'postingComment', 'quantity', 'commodity',
    ];
    const lines = [fields.join(',')];
    for (const row of transactionRows(report)) {
      lines.push(fields.map((field) => csvField(row[field])).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function formatPostingAmount(amount, formats) {
    const quantity = formats.has(amount.commodity)
      ? displayQuantity(amount.quantity, amount.commodity, formats, null)
      : amount.quantity;
    return `${quantity} ${amount.commodity}`;
  }

  function formatAnnotationAmount(amount, formats) {
    return `${formatPriceQuantity(
      amount.quantity, amount.commodity, formats,
    )} ` +
      amount.commodity;
  }

  function decimalScale(quantity) {
    const point = quantity.indexOf('.');
    return point < 0 ? 0 : quantity.length - point - 1;
  }

  function formatPostingExpression(posting, formats) {
    const expressions = [];
    let amountText = null;
    if (posting.amount !== null) {
      amountText = formatPostingAmount(posting.amount, formats);
    } else if (posting.balanceAssignment !== null) {
      const inferredAmount = posting.amounts.find((amount) =>
        amount.commodity === posting.balanceAssignment.commodity);
      if (inferredAmount) {
        amountText = formatPostingAmount(inferredAmount, formats);
      }
    }
    if (amountText !== null) expressions.push(amountText);
    if (posting.lotCost !== null) {
      if (posting.lotCost.isTotal) {
        const amount = parseDecimal(posting.amount.quantity);
        const absoluteAmount = amount.coefficient < 0n
          ? { ...amount, coefficient: -amount.coefficient }
          : amount;
        const unitCostScale = decimalScale(posting.lotCost.quantity) +
          decimalScale(posting.amount.quantity) + 6;
        const unitCost = divideDecimals(
          parseDecimal(posting.lotCost.quantity), absoluteAmount, unitCostScale,
        );
        const lotCost = {
          quantity: formatDecimal(unitCost),
          commodity: posting.lotCost.commodity,
        };
        expressions.push(`{${formatAnnotationAmount(lotCost, formats)}}`);
      } else {
        expressions.push(`{${formatAnnotationAmount(
          posting.lotCost, formats,
        )}}`);
      }
    }
    if (posting.cost !== null) {
      expressions.push(
        `${posting.cost.isTotal ? '@@' : '@'} ${formatAnnotationAmount(
          posting.cost, formats,
        )}`,
      );
    }
    if (posting.balanceAssignment !== null) {
      expressions.push(`= ${formatAnnotationAmount(
        posting.balanceAssignment, formats,
      )}`);
    }
    if (posting.balanceAssertion !== null) {
      expressions.push(`= ${formatAnnotationAmount(
        posting.balanceAssertion, formats,
      )}`);
    }
    return { text: expressions.join(' '), amountWidth: amountText?.length ?? 0 };
  }

  function formatTransactionsText(report, descriptions) {
    const accountColumnWidth = 34;
    const amountColumnWidth = 12;
    const maximumPostingLineWidth = 61;
    const formats = commodityFormats(descriptions);
    const lines = [];
    for (const transaction of report.transactions) {
      const date = transaction.transactionDate;
      const header = `${date} ${transaction.description}`;
      const inlineTransactionComment = transaction.comment === null
        ? ''
        : ` ; ${transaction.comment}`;
      const multilineTransactionComment = transaction.comment !== null &&
        `${header}${inlineTransactionComment}`.length > 80;
      lines.push(`${header}${multilineTransactionComment ? '' : inlineTransactionComment}`);
      if (multilineTransactionComment) lines.push(`    ; ${transaction.comment}`);
      const positionedNotes = transaction.positionedNotes ?? transaction.notes.map((text) => ({
        line: Number.NEGATIVE_INFINITY, text,
      }));
      let noteIndex = 0;
      const canElideAmount = transaction.postings.length === 2 &&
        transaction.postings.every((posting) =>
          posting.amounts.length === 1 && posting.lotCost === null && posting.cost === null &&
          posting.balanceAssignment === null && posting.balanceAssertion === null) &&
        transaction.postings[0].amounts[0].commodity ===
          transaction.postings[1].amounts[0].commodity &&
        compareDecimals(addDecimals(
          parseDecimal(transaction.postings[0].amounts[0].quantity),
          parseDecimal(transaction.postings[1].amounts[0].quantity),
        ), parseDecimal('0')) === 0;
      const implicitPostingIndexes = transaction.postings.flatMap((posting, index) =>
        posting.amount === null ? [index] : []);
      const elidedAmountIndex = canElideAmount
        ? implicitPostingIndexes.length === 1 ? implicitPostingIndexes[0] : 1
        : -1;
      transaction.postings.forEach((posting, index) => {
        while (noteIndex < positionedNotes.length &&
               positionedNotes[noteIndex].line <
                 (posting.sourceLine ?? Number.POSITIVE_INFINITY)) {
          lines.push(`    ; ${positionedNotes[noteIndex].text}`);
          noteIndex += 1;
        }
        const formattedExpression = formatPostingExpression(posting, formats);
        const expression = index === elidedAmountIndex ? '' : formattedExpression.text;
        const alignmentWidth = posting.lotCost !== null || posting.cost !== null
          ? expression.length
          : formattedExpression.amountWidth;
        const alignedExpression = (width) => expression.padStart(
          expression.length + Math.max(0, width - alignmentWidth),
        );
        const body = expression === ''
          ? posting.account +
            (posting.amount !== null && posting.account.length > accountColumnWidth ? '  ' : '')
          : posting.account.length > accountColumnWidth
            ? `${posting.account}  ${alignedExpression(10)}`
            : `${posting.account.padEnd(accountColumnWidth)}  ` +
              alignedExpression(amountColumnWidth);
        const inlineComment = posting.comment === null ? '' : `  ; ${posting.comment}`;
        const maximumWidth = expression === '' ? maximumPostingLineWidth : 80;
        const projectedLineLength = expression === ''
          ? 4 + Math.min(posting.account.length, accountColumnWidth) +
            (posting.amount !== null && posting.account.length > accountColumnWidth ? 2 : 0) +
            inlineComment.length
          : `    ${body}${inlineComment}`.length;
        const multilineComment = posting.comment !== null &&
          projectedLineLength > maximumWidth;
        const postingComment = multilineComment ? '' : inlineComment;
        lines.push(`    ${body}${postingComment}`);
        if (multilineComment) lines.push(`    ; ${posting.comment}`);
      });
      while (noteIndex < positionedNotes.length) {
        lines.push(`    ; ${positionedNotes[noteIndex].text}`);
        noteIndex += 1;
      }
      lines.push('');
    }
    if (lines.length === 0) return '';
    lines.pop();
    return `${lines.join('\n')}\n`;
  }

  function formatTransactions(report, { format }, descriptions) {
    if (format === 'json') return formatJson(report);
    if (format === 'csv') return formatTransactionsCsv(report);
    return formatTransactionsText(report, descriptions);
  }

  function postingCsvRows(postings) {
    return postings.flatMap((posting) => posting.amounts.map((resolvedAmount) => ({
      filename: posting.filename,
      transactionSourceLine: posting.transactionSourceLine,
      postingId: posting.postingId,
      transactionId: posting.transactionId,
      transactionDate: posting.transactionDate,
      description: posting.description,
      transactionComment: posting.transactionComment ?? '',
      transactionNotes: JSON.stringify(posting.transactionNotes),
      postingDate: posting.postingDate,
      account: posting.account,
      postingComment: posting.postingComment ?? '',
      amountQuantity: posting.amount?.quantity ?? '',
      amountCommodity: posting.amount?.commodity ?? '',
      lotCostQuantity: posting.lotCost?.quantity ?? '',
      lotCostCommodity: posting.lotCost?.commodity ?? '',
      lotCostIsTotal: posting.lotCost?.isTotal ?? '',
      costQuantity: posting.cost?.quantity ?? '',
      costCommodity: posting.cost?.commodity ?? '',
      costIsTotal: posting.cost?.isTotal ?? '',
      balanceAssignmentQuantity: posting.balanceAssignment?.quantity ?? '',
      balanceAssignmentCommodity: posting.balanceAssignment?.commodity ?? '',
      balanceAssertionQuantity: posting.balanceAssertion?.quantity ?? '',
      balanceAssertionCommodity: posting.balanceAssertion?.commodity ?? '',
      resolvedQuantity: resolvedAmount.quantity,
      resolvedCommodity: resolvedAmount.commodity,
      resolvedBalance: resolvedAmount.balance,
    })));
  }

  function formatPostingsCsv(postings) {
    const fields = [
      'postingId', 'transactionId', 'transactionDate', 'description', 'transactionComment',
      'transactionNotes', 'postingDate', 'account', 'postingComment',
      'amountQuantity', 'amountCommodity', 'lotCostQuantity', 'lotCostCommodity',
      'lotCostIsTotal', 'costQuantity', 'costCommodity', 'costIsTotal',
      'balanceAssignmentQuantity', 'balanceAssignmentCommodity',
      'balanceAssertionQuantity', 'balanceAssertionCommodity',
      'resolvedQuantity', 'resolvedCommodity', 'resolvedBalance',
      'filename', 'transactionSourceLine',
    ];
    const lines = [fields.join(',')];
    for (const row of postingCsvRows(postings)) {
      lines.push(fields.map((field) => csvField(row[field])).join(','));
    }
    return `${lines.join('\n')}\n`;
  }

  function formatPostingsText(postings) {
    if (postings.length === 0) return '';
    const rows = postingCsvRows(postings).map((row) => ({
      ...row,
      transactionNotes: JSON.parse(row.transactionNotes).join(' | '),
    }));
    return formatTextTable(rows, [
      { heading: 'Transaction', value: (row) => row.transactionDate },
      { heading: 'Posting', value: (row) => row.postingDate },
      { heading: 'Description', value: (row) => row.description },
      { heading: 'Account', value: (row) => row.account },
      { heading: 'Amount', value: (row) => row.resolvedQuantity, align: 'right' },
      { heading: 'Commodity', value: (row) => row.resolvedCommodity },
      { heading: 'Transaction comment', value: (row) => row.transactionComment },
      { heading: 'Notes', value: (row) => row.transactionNotes },
      { heading: 'Posting comment', value: (row) => row.postingComment },
      { heading: 'Filename', value: (row) => row.filename },
      { heading: 'Transaction source line', value: (row) => row.transactionSourceLine },
    ]);
  }

  function formatPostings(postings, { format }) {
    if (format === 'json') return formatJson(postings);
    if (format === 'csv') return formatPostingsCsv(postings);
    return formatPostingsText(postings);
  }

  function formatBalanceHistoryHumanReadable(rows, descriptions) {
    const formats = commodityFormats(descriptions);
    const amounts = rows.map((row) =>
      displayQuantity(row.amount, row.commodity, formats, 2, false));
    const amountWidth = Math.max(0, ...amounts.map((amount) => amount.length));
    const lines = rows.map((row, index) =>
      `${row.date}  ${amounts[index].padStart(amountWidth)} ${row.commodity}`);
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  function formatInvestmentPerformance(report, descriptions) {
    const formats = commodityFormats(descriptions);
    const money = (value) => `${displayQuantity(
      String(value), report.valuationCommodity, formats, 2, false,
    )} ${report.valuationCommodity}`;
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
    appendTotal,
    formatCsv,
    formatBalanceHistoryCsv,
    formatBalanceHistoryHumanReadable,
    formatHumanReadable,
    formatInvestmentPerformance,
    formatInvestmentPerformanceJson,
    formatTransactions,
    formatJson,
    formatWarnings,
    formatAccounts,
    formatCommodities,
    formatPrices,
    formatPostings,
    formatTags,
    $$private: { parseCommodityFormat },
  };
};
