'use strict';

module.exports = ({
  rational: { zero, parse, add, sub, neg, cmp, div, format },
  commodityMovements: { annotatedTotal },
  ingestionWarning: { createWarning, warningCodes },
}) => {
  // Account names do not identify settlement, fees, or realized results. Check
  // whether any partition of the monetary postings can explain the trade value.
  // A bounded search may be inconclusive; it must never manufacture a warning.
  function canExplainSettlement(amounts, target, tolerance) {
    const absolute = (value) => value.n < 0n ? neg(value) : value;
    const ordered = amounts.filter((value) => value.n)
      .sort((left, right) => cmp(absolute(right), absolute(left)));
    const lower = [zero];
    const upper = [zero];
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      lower.unshift(add(lower[0], ordered[index].n < 0n ? ordered[index] : zero));
      upper.unshift(add(upper[0], ordered[index].n > 0n ? ordered[index] : zero));
    }
    const pending = [{ index: 0, remaining: target }];
    const visited = new Set();
    while (pending.length) {
      const { index, remaining } = pending.pop();
      if (cmp(absolute(remaining), tolerance) <= 0) return true;
      if (index === ordered.length || cmp(remaining, sub(lower[index], tolerance)) < 0 ||
          cmp(remaining, add(upper[index], tolerance)) > 0) continue;
      const key = `${index}:${format(remaining)}`;
      if (visited.has(key)) continue;
      if (visited.size >= 100000) return null;
      visited.add(key);
      pending.push({ index: index + 1, remaining });
      pending.push({ index: index + 1, remaining: sub(remaining, ordered[index]) });
    }
    return false;
  }

  function validateSaleProceeds(transaction, resolved, valuationCommodity, carried, roundingUnit, warnings) {
    let tradeValue = zero;
    let hasSale = false;
    const monetaryAmounts = [];
    for (const [index, posting] of transaction.postings.entries()) {
      if (carried.has(posting)) continue;
      for (const amount of resolved[index]) {
        const quantity = parse(amount.quantity);
        if (!quantity.n) continue;
        if (amount.commodity === valuationCommodity) {
          if (posting.cost || posting.lotCost) return;
          monetaryAmounts.push(quantity);
          continue;
        }
        const annotation = quantity.n < 0n ? posting.cost : posting.lotCost;
        if (annotation?.amount.commodity !== valuationCommodity) return;
        tradeValue = add(tradeValue, annotatedTotal(annotation, quantity));
        hasSale ||= quantity.n < 0n;
      }
    }
    if (!hasSale) return;
    const settlement = neg(tradeValue);
    const tolerance = div(roundingUnit, parse('2'));
    if (canExplainSettlement(monetaryAmounts, settlement, tolerance) === false) {
      warnings.push(createWarning(warningCodes.SALE_PROCEEDS_MISMATCH,
        `${transaction.description}: recorded trade prices require settlement of ` +
        `${format(settlement)} ${valuationCommodity}, which cannot be explained by ` +
        'the monetary postings, including separately posted fees', transaction.location));
    }
  }

  return { validateSaleProceeds };
};
