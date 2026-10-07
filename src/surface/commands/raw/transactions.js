'use strict';

module.exports = ({ cliOptions: options }) => ({
  description: 'show transactions',
  loadFormatData(journal) {
    return journal.commodities({ usage: 'all' });
  },
  configure(command) {
    options.journal(command);
    options.accounts(command);
    options.addValue(command, '--id <id>', 'select one transaction ID');
    options.addValue(command, '--order <order>', 'sort transactions', {
      choices: ['newest', 'oldest'],
      defaultValue: 'oldest',
    });
    options.addValue(command, '--page <number>', 'select a page (requires --page-size)');
    options.addValue(command, '--page-size <number>', 'set the page size (requires --page)');
    options.format(command);
  },
  formatCsv(report, _cliOptions, { csvField }) {
    function transactionRows(report) {
      return report.transactions.flatMap((transaction) =>
        transaction.postings.flatMap((posting) => posting.amounts.map((amount) => ({
          transactionId: transaction.transactionId,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          transactionNotes: JSON.stringify(transaction.notes),
          postingDate: posting.postingDate,
          account: posting.account,
          postingNotes: JSON.stringify(posting.notes),
          quantity: amount.quantity,
          commodity: amount.commodity,
        }))));
    }

    function formatTransactionsCsv(report) {
      const fields = [
        'transactionId', 'transactionDate', 'description', 'transactionNotes',
        'postingDate', 'account', 'postingNotes', 'quantity', 'commodity',
      ];
      const lines = [fields.join(',')];
      for (const row of transactionRows(report)) {
        lines.push(fields.map((field) => csvField(row[field])).join(','));
      }
      return `${lines.join('\n')}\n`;
    }

    return formatTransactionsCsv(report);
  },
  formatText(report, _cliOptions, format, descriptions) {
    const { addDecimals, commodityFormats, compareDecimals, decimalScale, displayQuantity, divideDecimals, formatDecimal, formatPriceQuantity, parseDecimal } = format;

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
      return {
        text: expressions.join(' '),
        amountWidth: amountText?.length ?? 0,
      };
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
        const transactionNotes = transaction.positionedNotes ??
          transaction.notes.map((text) => ({ position: 1, text }));
        const inlineTransactionNote = transactionNotes.find((note) => note.position === 0)?.text;
        const inlineHeader = inlineTransactionNote === undefined ? '' : ` ; ${inlineTransactionNote}`;
        const wrapHeaderNote = inlineTransactionNote !== undefined &&
          `${header}${inlineHeader}`.length > 80;
        lines.push(`${header}${wrapHeaderNote ? '' : inlineHeader}`);
        if (wrapHeaderNote) lines.push(`    ; ${inlineTransactionNote}`);
        for (const note of transactionNotes) {
          if (note.position !== 0) lines.push(`    ; ${note.text}`);
        }
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
          const postingNotes = posting.positionedNotes ??
            posting.notes.map((text) => ({ position: 1, text }));
          const inlinePostingNote = postingNotes.find((note) => note.position === 0)?.text;
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
          const inlineNote = inlinePostingNote === undefined ? '' : `  ; ${inlinePostingNote}`;
          const maximumWidth = expression === '' ? maximumPostingLineWidth : 80;
          const projectedLineLength = expression === ''
            ? 4 + Math.min(posting.account.length, accountColumnWidth) +
              (posting.amount !== null && posting.account.length > accountColumnWidth ? 2 : 0) +
              inlineNote.length
            : `    ${body}${inlineNote}`.length;
          const wrapPostingNote = inlinePostingNote !== undefined &&
            projectedLineLength > maximumWidth;
          const postingNote = wrapPostingNote ? '' : inlineNote;
          lines.push(`    ${body}${postingNote}`);
          if (wrapPostingNote) lines.push(`    ; ${inlinePostingNote}`);
          for (const note of postingNotes) {
            if (note.position !== 0) lines.push(`    ; ${note.text}`);
          }
        });
        lines.push('');
      }
      if (lines.length === 0) return '';
      lines.pop();
      return `${lines.join('\n')}\n`;
    }

    return formatTransactionsText(report, descriptions);
  },
});
