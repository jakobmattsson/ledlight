'use strict';

module.exports = ({ decimal: { addDecimals, formatDecimal, parseDecimal } }) => {
  function appendTotal(rows) {
    const totals = new Map();
    for (const row of rows) {
      let total = totals.get(row.commodity);
      if (!total) {
        total = { quantity: parseDecimal('0') };
        totals.set(row.commodity, total);
      }
      total.quantity = addDecimals(total.quantity, parseDecimal(row.quantity));
      if (row.valuationValue !== undefined) {
        total.valuationValue = addDecimals(
          total.valuationValue ?? parseDecimal('0'),
          parseDecimal(row.valuationValue),
        );
      }
    }
    return [...rows, ...[...totals.keys()].sort().map((commodity) => {
      const total = totals.get(commodity);
      return {
        account: 'Total',
        commodity,
        isTotal: true,
        quantity: formatDecimal(total.quantity),
        ...(total.valuationValue === undefined ? {} : {
          valuationValue: formatDecimal(total.valuationValue),
        }),
      };
    })];
  }

  return { appendTotal };
};
