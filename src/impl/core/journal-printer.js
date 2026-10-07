'use strict';

module.exports = () => {
  const amountText = ({ quantity, commodity }) => `${quantity} ${commodity}`;
  const withComment = (text, comment) => comment === null ? text : `${text}  ; ${comment}`;

  function postingText(posting) {
    const expression = [];
    if (posting.amount) expression.push(amountText(posting.amount));
    if (posting.lotCost) {
      const braces = posting.lotCost.total ? ['{{', '}}'] : ['{', '}'];
      expression.push(`${braces[0]}${amountText(posting.lotCost.amount)}${braces[1]}`);
    }
    if (posting.cost) {
      expression.push(`${posting.cost.total ? '@@' : '@'} ${amountText(posting.cost.amount)}`);
    }
    if (posting.balanceAssignment) {
      expression.push(`= ${amountText(posting.balanceAssignment)}`);
    }
    if (posting.balanceAssertion) {
      expression.push(`= ${amountText(posting.balanceAssertion)}`);
    }
    const line = `    ${posting.account}${expression.length ? `  ${expression.join(' ')}` : ''}`;
    return withComment(line, posting.comment);
  }

  function transactionText(entry) {
    const lines = [withComment(`${entry.date} ${entry.description}`, entry.comment)];
    const children = [
      ...entry.postings.map((posting) => ({ line: posting.location.line, text: postingText(posting) })),
      ...entry.notes.map((note) => ({ line: note.location.line, text: `    ; ${note.text}` })),
    ].sort((left, right) => left.line - right.line);
    lines.push(...children.map(({ text }) => text));
    return lines.join('\n');
  }

  function entryText(entry) {
    switch (entry.type) {
      case 'account':
      case 'tag':
        return withComment(`${entry.type} ${entry.name}`, entry.comment);
      case 'commodity':
        return [
          withComment(`commodity ${entry.symbol}`, entry.comment),
          ...entry.properties.map((property) => withComment(
            `  ${property.name}${property.value === null ? '' : ` ${property.value}`}`,
            property.comment,
          )),
        ].join('\n');
      case 'price':
        return withComment(
          `P ${entry.date} ${entry.commodity} ${amountText(entry.price)}`,
          entry.comment,
        );
      case 'transaction':
        return transactionText(entry);
      default:
        throw new Error(`Cannot print unsupported journal entry type: ${entry.type}`);
    }
  }

  return { printEntry: entryText };
};
