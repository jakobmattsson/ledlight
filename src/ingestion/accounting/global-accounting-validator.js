'use strict';

module.exports = ({
  rational: { zero, parse, add, neg, cmp, format },
  commodityMovements: { annotatedTotal, carriedMovements },
  allocationHistory: { AllocationHistory },
  ingestionWarning: { createWarning, warningCodes },
}) => {
  function validatePostingDateHoldings(resolvedTransactions, valuationCommodity, warnings) {
    const positions = new Map();
    for (const [transaction, resolved] of resolvedTransactions) {
      transaction.postings.forEach((posting, index) => {
        for (const amount of resolved[index]) {
          if (amount.commodity === valuationCommodity) continue;
          const key = JSON.stringify([posting.account, amount.commodity]);
          if (!positions.has(key)) positions.set(key, new Map());
          const days = positions.get(key);
          const date = posting.postingDate || transaction.date;
          if (!days.has(date)) days.set(date, { quantity: zero });
          const day = days.get(date);
          const quantity = parse(amount.quantity);
          day.quantity = add(day.quantity, quantity);
          if (quantity.n < 0n) day.location = posting.location;
        }
      });
    }
    for (const [key, days] of positions) {
      const [account, commodity] = JSON.parse(key);
      let balance = zero;
      // Reports expose daily positions, so same-day movements are netted first.
      for (const [date, day] of [...days].sort(([left], [right]) => left.localeCompare(right))) {
        balance = add(balance, day.quantity);
        if (balance.n < 0n && day.quantity.n < 0n) {
          warnings.push(createWarning(warningCodes.NEGATIVE_POSTING_DATE_HOLDING,
            `${account}: holding is ${format(balance)} ${commodity} on ${date} ` +
            'using posting dates; disposals must not precede available acquisitions', day.location));
        }
      }
    }
  }

  function validateGlobalAccounting(entries, resolvedTransactions, valuationCommodity, warnings) {
    if (!valuationCommodity) return;
    validatePostingDateHoldings(resolvedTransactions, valuationCommodity, warnings);
    const declaration = entries.find((entry) =>
      entry.type === 'commodity' && entry.symbol === valuationCommodity);
    const declaredFormat = declaration?.properties.find(({ name }) => name === 'format')?.value;
    const formatMatch = /^(?:[\d,]+)(?:\.(\d+))?[ \t]+/u.exec(declaredFormat || '');
    const scale = formatMatch?.[1]?.length ?? 0;
    const roundingUnit = formatMatch ? parse(scale ? `0.${'0'.repeat(scale - 1)}1` : '1') : zero;
    const histories = new Map();
    const positions = new Map();
    const impossible = [];
    let imbalance = zero;
    let imbalanceLocation;
    const transactions = entries.filter((entry) => resolvedTransactions.has(entry))
      .sort((left, right) => left.date.localeCompare(right.date));
    const historyFor = (account, commodity) => {
      const key = JSON.stringify([account, commodity]);
      if (!histories.has(key)) histories.set(key, new AllocationHistory(roundingUnit));
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
