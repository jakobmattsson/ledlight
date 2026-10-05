'use strict';

module.exports = ({ rational: { zero, parse, mul, neg, add, cmp } }) => {
  function annotatedTotal(annotation, quantity) {
    if (!annotation) return null;
    const cost = parse(annotation.amount.quantity);
    if (!annotation.total) return mul(quantity, cost);
    return quantity.n < 0n && cost.n > 0n ? neg(cost) : cost;
  }

  // A paired movement carries basis without a sale price. Different accounts
  // require equal units; a same-account pair may change the unit scale.
  function carriedMovements(transaction, valuationCommodity) {
    const candidates = new Map();
    for (const posting of transaction.postings) {
      if (!posting.amount || posting.cost || !posting.lotCost ||
          posting.amount.commodity === valuationCommodity) continue;
      const key = JSON.stringify([posting.amount.commodity, posting.lotCost.amount.commodity]);
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push(posting);
    }
    const pairs = [];
    for (const postings of candidates.values()) {
      const unused = new Set(postings);
      for (const outgoing of postings) {
        const quantity = parse(outgoing.amount.quantity);
        if (quantity.n >= 0n || !unused.has(outgoing)) continue;
        const basis = annotatedTotal(outgoing.lotCost, quantity);
        const incoming = [...unused].find((candidate) => {
          const units = parse(candidate.amount.quantity);
          return units.n > 0n &&
            (candidate.account === outgoing.account || cmp(units, neg(quantity)) === 0) &&
            cmp(add(basis, annotatedTotal(candidate.lotCost, units)), zero) === 0;
        });
        if (incoming) {
          unused.delete(outgoing);
          unused.delete(incoming);
          pairs.push({ outgoing, incoming });
        }
      }
    }
    return pairs;
  }
  return { annotatedTotal, carriedMovements };
};
