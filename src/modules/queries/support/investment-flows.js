'use strict';

module.exports = ({
  rational: { zero, parse, add, mul, neg, format },
  commodityMovements: { annotatedTotal, carriedMovements },
  publicErrors: { createError, errorCodes },
}) => {
  function calculateFlows(postings, options, valuationCommodity) {
    const transactions = new Map();
    for (const posting of postings) {
      if (!transactions.has(posting.transactionId)) transactions.set(posting.transactionId, []);
      transactions.get(posting.transactionId).push(posting);
    }
    const daily = new Map();
    const addFlow = (date, value) => daily.set(date, add(daily.get(date) || zero, value));
    const inPeriod = (date) => (!options.from || date >= options.from) && (!options.to || date <= options.to);
    const convert = (quantity, rate, commodity, date) => {
      if (!quantity.n) return zero;
      if (rate === null) {
        throw createError(errorCodes.MISSING_VALUATION_DATA,
          `No price for ${commodity} on or before ${date} can convert a cash flow to ${valuationCommodity}`);
      }
      return mul(quantity, parse(rate));
    };
    const marketValue = (posting) => convert(parse(posting.amount.quantity), posting.marketRate,
      posting.amount.commodity, posting.date);

    for (const transaction of transactions.values()) {
      const paired = new Set();
      const internal = new Set();
      for (const { outgoing, incoming } of carriedMovements({ postings: transaction }, valuationCommodity)) {
        paired.add(outgoing);
        paired.add(incoming);
        if (outgoing.selected && incoming.selected && outgoing.date === incoming.date) {
          internal.add(outgoing);
          internal.add(incoming);
        }
      }
      const groups = new Map();
      for (const posting of transaction) {
        if (!posting.selectedAccount || !inPeriod(posting.date)) continue;
        const key = JSON.stringify([posting.date, posting.account]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(posting);
      }
      for (const group of groups.values()) {
        const selected = group.filter((posting) => posting.selected && !internal.has(posting));
        if (!selected.length) continue;
        const annotationFor = (posting) => parse(posting.amount.quantity).n < 0n
          ? posting.cost : posting.lotCost;
        const incomplete = selected.some((posting) => posting.amount.commodity !== valuationCommodity &&
          parse(posting.amount.quantity).n && !paired.has(posting) && !annotationFor(posting));
        if (incomplete) {
          // Preserve the market/counterposting fallback for incomplete journals.
          // Valid annotated trades never depend on which account holds cash.
          let selectedValue = zero;
          let unselectedValue = zero;
          for (const posting of group) {
            const value = marketValue(posting);
            if (posting.selected) selectedValue = add(selectedValue, value);
            else unselectedValue = add(unselectedValue, value);
          }
          if (selectedValue.n) addFlow(group[0].date, unselectedValue.n ? neg(unselectedValue) : selectedValue);
          continue;
        }
        for (const posting of selected) {
          const annotation = annotationFor(posting);
          let value;
          if (posting.amount.commodity === valuationCommodity || paired.has(posting) || !annotation) {
            value = marketValue(posting);
          } else {
            const rate = annotation === posting.cost ? posting.costRate : posting.lotRate;
            value = convert(annotatedTotal(annotation, parse(posting.amount.quantity)),
              rate, annotation.amount.commodity, posting.date);
          }
          addFlow(posting.date, value);
        }
      }
    }
    return [...daily].sort(([left], [right]) => left.localeCompare(right))
      .map(([date, flow]) => ({ date, flow: Number(format(flow)) }));
  }

  return { calculateFlows };
};
