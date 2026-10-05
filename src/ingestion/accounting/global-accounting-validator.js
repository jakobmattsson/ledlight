'use strict';

module.exports = ({
  rational: { zero, parse, add, neg, cmp, format },
  commodityMovements: { annotatedTotal, carriedMovements },
  allocationHistory: { AllocationHistory },
  costCurrencies: { costCurrenciesFromEntries, currencyCapitalAccount },
  ingestionWarning: { createWarning, warningCodes },
}) => {
  function validateGlobalAccounting(entries, resolvedTransactions, valuationCommodity, warnings) {
    if (!valuationCommodity) return;
    const costCurrencies = costCurrenciesFromEntries(entries, valuationCommodity);
    const roundingUnits = new Map();
    function roundingUnit(commodity) {
      if (!roundingUnits.has(commodity)) {
        const declaration = entries.find((entry) =>
          entry.type === 'commodity' && entry.symbol === commodity);
        const declaredFormat = declaration?.properties.find(({ name }) => name === 'format')?.value;
        const match = /^(?:[\d,]+)(?:\.(\d+))?[ \t]+/u.exec(declaredFormat || '');
        const scale = match?.[1]?.length ?? 0;
        roundingUnits.set(commodity, match ? parse(scale ? `0.${'0'.repeat(scale - 1)}1` : '1') : zero);
      }
      return roundingUnits.get(commodity);
    }
    const histories = new Map();
    const positions = new Map();
    const impossible = [];
    const imbalances = new Map();
    const transactions = entries.filter((entry) => resolvedTransactions.has(entry))
      .sort((left, right) => left.date.localeCompare(right.date));
    const capitalAccount = (account, commodity) => costCurrencies.has(commodity)
      ? currencyCapitalAccount(commodity) : account;
    const keyFor = (account, commodity, costCommodity) => JSON.stringify([
      costCurrencies.has(commodity), capitalAccount(account, commodity), commodity, costCommodity,
    ]);
    const historyFor = (account, commodity, costCommodity) => {
      const key = keyFor(account, commodity, costCommodity);
      if (!histories.has(key)) histories.set(key, new AllocationHistory(roundingUnit(costCommodity)));
      return histories.get(key);
    };

    for (const transaction of transactions) {
      const resolved = resolvedTransactions.get(transaction);
      const pairs = carriedMovements(transaction, valuationCommodity);
      for (const pair of pairs) {
        const commodity = pair.outgoing.amount.commodity;
        const costCommodity = pair.outgoing.lotCost.amount.commodity;
        const source = historyFor(pair.outgoing.account, commodity, costCommodity);
        const target = historyFor(pair.incoming.account, commodity, costCommodity);
        if (source !== target) {
          source.merge(target);
          for (const [key, history] of histories) if (history === target) histories.set(key, source);
        }
      }
      const incoming = new Set(pairs.map((pair) => pair.incoming));
      const outgoing = new Map(pairs.map((pair) => [pair.outgoing, pair.incoming]));
      const transactionBalance = new Map();
      const addBalance = (commodity, quantity) => transactionBalance.set(
        commodity, add(transactionBalance.get(commodity) || zero, quantity),
      );
      let knownBalance = true;
      let hasInvestment = false;
      // Reclassified currency profits can fund an exchange in the same transaction,
      // regardless of the textual ordering of its postings.
      const postings = transaction.postings.map((posting, index) => ({ posting, index }));
      const currencyAcquisition = ({ posting }) => costCurrencies.has(posting.amount?.commodity) &&
        posting.lotCost && parse(posting.amount.quantity).n > 0n ? 0 : 1;
      postings.sort((left, right) => currencyAcquisition(left) - currencyAcquisition(right));
      postings.forEach(({ posting, index }) => {
        for (const amount of resolved[index]) {
          const quantity = parse(amount.quantity);
          if (amount.commodity === valuationCommodity ||
              (costCurrencies.has(amount.commodity) && !posting.lotCost)) {
            addBalance(amount.commodity, quantity);
            continue;
          }
          hasInvestment = true;
          const costCommodity = posting.lotCost?.amount.commodity || valuationCommodity;
          const account = capitalAccount(posting.account, amount.commodity);
          const history = historyFor(posting.account, amount.commodity, costCommodity);
          const key = keyFor(posting.account, amount.commodity, costCommodity);
          if (!positions.has(key)) {
            positions.set(key, {
              account, commodity: amount.commodity, costCommodity,
              quantity: zero, cost: zero, known: true, location: posting.location,
            });
          }
          const position = positions.get(key);
          position.quantity = add(position.quantity, quantity);
          position.location = posting.location;
          const cost = posting.lotCost ? annotatedTotal(posting.lotCost, quantity) : null;
          if (cost === null) {
            position.known = false;
            history.invalid = true;
            knownBalance = false;
            continue;
          }
          position.cost = add(position.cost, cost);
          addBalance(costCommodity, cost);
          const destination = outgoing.get(posting);
          if (incoming.has(posting) || !quantity.n ||
              (costCurrencies.has(amount.commodity) && destination &&
                !add(quantity, parse(destination.amount.quantity)).n)) continue;
          if (quantity.n > 0n) history.acquire(account, quantity, cost);
          else {
            const failure = history.dispose(
              account, neg(quantity), neg(cost),
              destination ? capitalAccount(destination.account, amount.commodity) : undefined,
              destination ? parse(destination.amount.quantity) : undefined,
            );
            if (failure) {
              impossible.push({
                transaction, posting, key, account, commodity: amount.commodity, costCommodity,
                quantity: neg(quantity), cost: neg(cost), closed: !position.quantity.n, ...failure,
              });
            }
          }
        }
      });
      if (hasInvestment && knownBalance) {
        for (const [commodity, balance] of transactionBalance) {
          if (!balance.n) continue;
          const previous = imbalances.get(commodity)?.quantity || zero;
          imbalances.set(commodity, {
            quantity: add(previous, balance), location: transaction.location,
          });
        }
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
      const { transaction, posting, account, commodity, costCommodity, quantity, cost, minimum, maximum } = failure;
      const range = failure.insufficient
        ? 'insufficient acquired units are available'
        : `allowed range is ${format(minimum)} to ${format(maximum)} ${costCommodity}`;
      warnings.push(createWarning(warningCodes.IMPOSSIBLE_COST_BASIS,
        `${transaction.description}: ${account} sold ${format(quantity)} ${commodity} ` +
        `with cost ${format(cost)} ${costCommodity}; ${range}`, posting.location));
    }
    for (const key of residuals) {
      const position = positions.get(key);
      warnings.push(createWarning(warningCodes.RESIDUAL_COST_BASIS,
        `${position.account}: zero ${position.commodity} units retain cost basis ` +
        `${format(position.cost)} ${position.costCommodity}`, position.location));
    }
    for (const [commodity, imbalance] of imbalances) {
      if (cmp(imbalance.quantity, zero) !== 0) {
        warnings.push(createWarning(warningCodes.RESULT_MISMATCH,
          'Realized plus unrealized result differs from cash flows and remaining ' +
          `market value by ${format(neg(imbalance.quantity))} ${commodity}`, imbalance.location));
      }
    }
  }
  return { validateGlobalAccounting };
};
