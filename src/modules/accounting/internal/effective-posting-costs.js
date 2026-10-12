'use strict';

module.exports = ({
  rational: { zero, parse, neg, div, mul, cmp, format },
  commodityMovements: { annotatedTotal, carriedMovements, unpricedReplacement },
  allocationHistory: { AllocationHistory },
  ingestionWarning: { createWarning, warningCodes },
}) => {
  const absolute = (value) => value.n < 0n ? neg(value) : value;
  const quantityOf = (posting) => parse(posting.amount.quantity);
  const totalOf = (posting, annotation) => annotatedTotal(annotation, quantityOf(posting));

  function annotation(total, quantity, commodity, preferTotal) {
    if (!quantity.n) return null;
    const unit = format(div(total, quantity));
    if (!preferTotal && !unit.includes('/')) {
      return { total: false, amount: { quantity: unit, commodity } };
    }
    const text = format(absolute(total));
    return text.includes('/') ? null : { total: true, amount: { quantity: text, commodity } };
  }

  function assign(posting, field, total, commodity, preferTotal) {
    if (!posting[field]) posting[field] = annotation(total, quantityOf(posting), commodity, preferTotal);
  }

  function inferEffectivePostingCosts(entries, valuationCommodity, warnings) {
    if (!valuationCommodity) return;
    const histories = new Map();
    const historyFor = (account, commodity) => {
      const key = JSON.stringify([account, commodity]);
      if (!histories.has(key)) histories.set(key, new AllocationHistory(zero));
      return histories.get(key);
    };
    const transactions = entries.filter((entry) => entry.type === 'transaction')
      .sort((left, right) => left.date.localeCompare(right.date));

    for (const transaction of transactions) {
      for (const posting of transaction.postings) {
        if (!posting.amount || posting.amount.commodity === valuationCommodity ||
            quantityOf(posting).n >= 0n || posting.lotCost) continue;
        const history = historyFor(posting.account, posting.amount.commodity);
        const quantity = neg(quantityOf(posting));
        const available = history.total(posting.account);
        if (history.invalid || cmp(quantity, available.quantity) > 0) continue;
        if (cmp(quantity, available.quantity) === 0) {
          assign(posting, 'lotCost', neg(available.cost), valuationCommodity);
        } else if (history.groups.has(posting.account)) {
          const groups = history.holdings(posting.account)
            .filter((group) => group.remaining.constant.n || group.remaining.coefficients.size);
          if (groups.length && groups.every((group) => cmp(group.price, groups[0].price) === 0)) {
            assign(posting, 'lotCost', mul(quantityOf(posting), groups[0].price), valuationCommodity);
          }
        }
      }

      const foreign = transaction.postings.filter((posting) => posting.amount &&
        posting.amount.commodity !== valuationCommodity && quantityOf(posting).n);
      const monetary = transaction.postings.filter((posting) =>
        posting.amount?.commodity === valuationCommodity);
      if (foreign.length === 2 && monetary.length === 0 && transaction.postings.length === 2) {
        const outgoing = foreign.find((posting) => quantityOf(posting).n < 0n);
        const incoming = foreign.find((posting) => quantityOf(posting).n > 0n);
        if (outgoing && incoming && outgoing.amount.commodity === incoming.amount.commodity &&
            !outgoing.cost && !incoming.cost && outgoing.lotCost && !incoming.lotCost &&
            (outgoing.account === incoming.account ||
              cmp(quantityOf(incoming), neg(quantityOf(outgoing))) === 0)) {
          assign(incoming, 'lotCost', neg(totalOf(outgoing, outgoing.lotCost)), valuationCommodity);
        }
        if (outgoing && incoming && outgoing.amount.commodity !== incoming.amount.commodity) {
          if (outgoing.cost?.amount.commodity === valuationCommodity && !incoming.cost) {
            assign(incoming, 'cost', neg(totalOf(outgoing, outgoing.cost)), valuationCommodity,
              outgoing.cost.total);
          } else if (incoming.cost?.amount.commodity === valuationCommodity && !outgoing.cost) {
            assign(outgoing, 'cost', neg(totalOf(incoming, incoming.cost)), valuationCommodity,
              incoming.cost.total);
          }
          if (!outgoing.cost && !incoming.cost && outgoing.lotCost && !incoming.lotCost) {
            assign(incoming, 'lotCost', neg(totalOf(outgoing, outgoing.lotCost)), valuationCommodity);
          }
          if (incoming.cost?.amount.commodity === valuationCommodity && !incoming.lotCost) {
            assign(incoming, 'lotCost', totalOf(incoming, incoming.cost), valuationCommodity);
          }
        }
      }

      if (foreign.length === 1 && monetary.length === 1 && transaction.postings.length === 2) {
        const posting = foreign[0];
        const settlement = neg(parse(monetary[0].amount.quantity));
        assign(posting, 'cost', settlement, valuationCommodity);
        if (quantityOf(posting).n > 0n) {
          assign(posting, 'lotCost', settlement, valuationCommodity);
        }
      }

      const replacement = unpricedReplacement(transaction, valuationCommodity);
      if (replacement?.outgoing.lotCost && replacement.incoming.lotCost) {
        const oldBasis = neg(totalOf(replacement.outgoing, replacement.outgoing.lotCost));
        const newBasis = totalOf(replacement.incoming, replacement.incoming.lotCost);
        if (cmp(oldBasis, newBasis) !== 0) {
          warnings.push(createWarning(warningCodes.INVALID_COMMODITY_TRADE,
            `An unpriced commodity replacement changes acquisition basis from ` +
              `${format(oldBasis)} ${valuationCommodity} to ${format(newBasis)} ${valuationCommodity}`,
            transaction.location));
        }
      }

      const pairs = carriedMovements(transaction, valuationCommodity);
      for (const pair of pairs) {
        const commodity = pair.outgoing.amount.commodity;
        const source = historyFor(pair.outgoing.account, commodity);
        const target = historyFor(pair.incoming.account, commodity);
        if (source !== target) {
          source.merge(target);
          for (const [key, history] of histories) if (history === target) histories.set(key, source);
        }
      }
      const incoming = new Set(pairs.map((pair) => pair.incoming));
      const outgoing = new Map(pairs.map((pair) => [pair.outgoing, pair.incoming]));
      for (const posting of transaction.postings) {
        if (!posting.amount || posting.amount.commodity === valuationCommodity ||
            !quantityOf(posting).n) continue;
        const history = historyFor(posting.account, posting.amount.commodity);
        const basis = posting.lotCost?.amount.commodity === valuationCommodity
          ? totalOf(posting, posting.lotCost) : null;
        if (basis === null) { history.invalid = true; continue; }
        if (incoming.has(posting)) continue;
        const quantity = quantityOf(posting);
        if (quantity.n > 0n) history.acquire(posting.account, quantity, basis);
        else {
          const destination = outgoing.get(posting);
          history.dispose(posting.account, neg(quantity), neg(basis),
            destination?.account, destination ? quantityOf(destination) : undefined);
        }
      }
    }
  }

  return { inferEffectivePostingCosts };
};
