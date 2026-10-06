'use strict';

const options = require('./options');

module.exports = {
  name: 'transactions', operation: 'transactions', group: 'raw',
  description: 'show transactions',
  configure(command) {
    options.journal(command);
    options.accounts(command);
    options.addValue(command, '--id <id>', 'select one transaction ID', { apiInput: 'id' });
    options.addValue(command, '--order <order>', 'sort transactions', {
      choices: ['newest', 'oldest'], defaultValue: 'oldest', apiInput: 'order',
    });
    options.addValue(command, '--page <number>', 'select a page', { apiInput: 'page' });
    options.addValue(command, '--page-size <number>', 'set the page size', {
      apiInput: 'pageSize',
    });
    options.format(command);
  },
  parse({ accounts, id, order, page, pageSize, format }) {
    return {
      options: options.compact({ accounts: accounts || [], id, order, page, pageSize }),
      output: { format },
    };
  },
  run({ options: input, output }, journal, format) {
    const descriptions = output.format === 'text'
      ? journal.commodities({ usage: 'all' })
      : undefined;
    if (output.format === 'text' && input.page === undefined && input.pageSize === undefined) {
      const firstPage = journal.transactions(input);
      const transactions = [...firstPage.transactions];
      for (let page = 2; page <= firstPage.totalPages; page += 1) {
        transactions.push(...journal.transactions({ ...input, page, pageSize: 100 }).transactions);
      }
      return format.formatTransactions({ ...firstPage, transactions }, output, descriptions);
    }
    return format.formatTransactions(journal.transactions(input), output, descriptions);
  },
  formatters(shared) {
    const { addDecimals, commodityFormats, compareDecimals, csvField, decimalScale, displayQuantity, divideDecimals, formatDecimal, formatJson, formatPriceQuantity, parseDecimal } = shared;

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

    return { formatTransactions };
  },
};
