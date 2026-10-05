'use strict';

module.exports = ({
  rational: { zero, parse, add, neg, cmp, format },
  commodityMovements: { annotatedTotal, carriedMovements },
  allocationHistory: { AllocationHistory },
  ingestionWarning: { createWarning, warningCodes },
}) => {
  function validateGlobalAccounting(entries, resolvedTransactions, valuationCommodity, warnings) {
    if (!valuationCommodity) return;
    const histories = new Map();
    const positions = new Map();
    const impossible = [];
    let imbalance = zero;
    let imbalanceLocation;
    const transactions = entries.filter((entry) => resolvedTransactions.has(entry))
      .sort((left, right) => left.date.localeCompare(right.date));
    const historyFor = (account, commodity) => {
      const key = JSON.stringify([account, commodity]);
      if (!histories.has(key)) histories.set(key, new AllocationHistory());
      return histories.get(key);
    };

    for (const transaction of transactions) {
      const resolved = resolvedTransactions.get(transaction);
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
      let transactionBalance = zero;
      let knownBalance = true;
      let hasInvestment = false;
      transaction.postings.forEach((posting, index) => {
        for (const amount of resolved[index]) {
          const quantity = parse(amount.quantity);
          if (amount.commodity === valuationCommodity) {
            transactionBalance = add(transactionBalance, quantity);
            continue;
          }
          hasInvestment = true;
          const history = historyFor(posting.account, amount.commodity);
          const key = JSON.stringify([posting.account, amount.commodity]);
          if (!positions.has(key)) {
            positions.set(key, {
              account: posting.account, commodity: amount.commodity,
              quantity: zero, cost: zero, known: true, location: posting.location,
            });
          }
          const position = positions.get(key);
          position.quantity = add(position.quantity, quantity);
          position.location = posting.location;
          const cost = posting.lotCost?.amount.commodity === valuationCommodity
            ? annotatedTotal(posting.lotCost, quantity) : null;
          if (cost === null) {
            position.known = false;
            history.invalid = true;
            knownBalance = false;
            continue;
          }
          position.cost = add(position.cost, cost);
          transactionBalance = add(transactionBalance, cost);
          if (incoming.has(posting) || !quantity.n) continue;
          if (quantity.n > 0n) history.acquire(posting.account, quantity, cost);
          else {
            const destination = outgoing.get(posting);
            const failure = history.dispose(
              posting.account, neg(quantity), neg(cost),
              destination?.account, destination ? parse(destination.amount.quantity) : undefined,
            );
            if (failure) {
              impossible.push({
                transaction, posting, key, commodity: amount.commodity,
                quantity: neg(quantity), cost: neg(cost), closed: !position.quantity.n, ...failure,
              });
            }
          }
        }
      });
      if (hasInvestment && knownBalance && transactionBalance.n) {
        imbalance = add(imbalance, transactionBalance);
        imbalanceLocation = transaction.location;
      }
    }

    const residuals = new Set();
    for (const [key, position] of positions) {
      if (position.known && !position.quantity.n && position.cost.n) residuals.add(key);
    }
    for (const failure of impossible) {
      // A closed position's residual is the more direct diagnosis of the same
      // failed final disposal. Keep historical violations on other positions.
      if (failure.closed && residuals.has(failure.key) &&
          positions.get(failure.key).location === failure.posting.location) continue;
      const { transaction, posting, commodity, quantity, cost, minimum, maximum } = failure;
      const range = failure.insufficient
        ? 'insufficient acquired units are available'
        : `allowed range is ${format(minimum)} to ${format(maximum)} ${valuationCommodity}`;
      warnings.push(createWarning(warningCodes.IMPOSSIBLE_COST_BASIS,
        `${transaction.description}: ${posting.account} sold ${format(quantity)} ${commodity} ` +
        `with cost ${format(cost)} ${valuationCommodity}; ${range}`, posting.location));
    }
    for (const key of residuals) {
      const position = positions.get(key);
      warnings.push(createWarning(warningCodes.RESIDUAL_COST_BASIS,
        `${position.account}: zero ${position.commodity} units retain cost basis ` +
        `${format(position.cost)} ${valuationCommodity}`, position.location));
    }
    if (cmp(imbalance, zero) !== 0) {
      warnings.push(createWarning(warningCodes.RESULT_MISMATCH,
        'Realized plus unrealized result differs from cash flows and remaining ' +
        `market value by ${format(neg(imbalance))} ${valuationCommodity}`, imbalanceLocation));
    }
  }
  return { validateGlobalAccounting };
};
