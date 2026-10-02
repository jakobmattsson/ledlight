'use strict';

module.exports = ({
  srcLedlightAccountingDecimal: {
    addDecimals,
    compareDecimals,
    formatDecimal,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
    subtractDecimals,
  },
}) => {



  const ZERO = parseDecimal('0');

  function balanceKey(account, commodity) {
    return `${account}\u0000${commodity}`;
  }

  function addToMap(map, key, value) {
    map.set(key, addDecimals(map.get(key) || ZERO, value));
  }

  function amountTolerance(quantity) {
    const point = quantity.indexOf('.');
    const scale = point < 0 ? 0 : quantity.length - point - 1;
    return { coefficient: 5n, scale: scale + 1 };
  }

  function recordTolerance(tolerances, commodity, quantity) {
    const tolerance = amountTolerance(quantity);
    const current = tolerances.get(commodity);
    if (!current || compareDecimals(tolerance, current) > 0) tolerances.set(commodity, tolerance);
  }

  function absoluteDecimal(decimal) {
    return decimal.coefficient < 0n
      ? { coefficient: -decimal.coefficient, scale: decimal.scale }
      : decimal;
  }

  function isCommodityExchange(residuals) {
    return residuals.length === 2 &&
    (residuals[0][1].coefficient < 0n) !== (residuals[1][1].coefficient < 0n);
  }

  function balancingAmount(posting, amount) {
    if (!posting.cost) return amount;
    const cost = parseDecimal(posting.cost.amount.quantity);
    let quantity;
    if (posting.cost.total) {
      const amountSign = compareDecimals(parseDecimal(amount.quantity), ZERO);
      quantity = amountSign < 0 && compareDecimals(cost, ZERO) > 0 ? negateDecimal(cost) : cost;
    } else {
      quantity = multiplyDecimals(parseDecimal(amount.quantity), cost);
    }
    return { quantity: formatDecimal(quantity), commodity: posting.cost.amount.commodity };
  }

  class PostingResolver {
    constructor() {
      this.balances = new Map();
    }

    accountBalance(account, commodity) {
      return this.balances.get(balanceKey(account, commodity)) || ZERO;
    }

    assignmentCommodity(posting) {
      if (posting.balanceAssignment.commodity) return posting.balanceAssignment.commodity;
      const prefix = `${posting.account}\u0000`;
      const commodities = [...this.balances]
        .filter(([key, amount]) => key.startsWith(prefix) && compareDecimals(amount, ZERO) !== 0)
        .map(([key]) => key.slice(prefix.length));
      if (commodities.length !== 1) {
        throw new Error(
          `Cannot infer balance assignment commodity at ` +
        `${posting.location.source}:${posting.location.line}`,
        );
      }
      return commodities[0];
    }

    apply(account, amount) {
      addToMap(this.balances, balanceKey(account, amount.commodity), parseDecimal(amount.quantity));
    }

    resolve(transaction) {
      const resolved = transaction.postings.map(() => []);
      const transactionBalance = new Map();
      const transactionTolerances = new Map();
      const calculatedCostCommodities = new Set();
      let implicitPosition = null;
      let hasCost = false;

      transaction.postings.forEach((posting, position) => {
        if (posting.cost) hasCost = true;
        let amount = posting.amount;
        if (posting.balanceAssignment) {
          const commodity = this.assignmentCommodity(posting);
          const target = parseDecimal(posting.balanceAssignment.quantity);
          const current = this.accountBalance(posting.account, commodity);
          amount = {
            quantity: formatDecimal(subtractDecimals(target, current)),
            commodity,
          };
        } else if (!amount) {
          if (implicitPosition !== null) {
            throw new Error(`Transaction at ${transaction.location.source}:${transaction.location.line} has multiple implicit postings`);
          }
          implicitPosition = position;
          return;
        }

        resolved[position].push(amount);
        this.apply(posting.account, amount);
        const balancing = balancingAmount(posting, amount);
        addToMap(transactionBalance, balancing.commodity, parseDecimal(balancing.quantity));
        if (posting.cost && !posting.cost.total) {
          calculatedCostCommodities.add(balancing.commodity);
        } else {
          const quantity = posting.cost
            ? posting.cost.amount.quantity
            : posting.balanceAssignment?.quantity || amount.quantity;
          recordTolerance(transactionTolerances, balancing.commodity, quantity);
        }

        if (posting.balanceAssertion) {
          const actual = this.accountBalance(posting.account, posting.balanceAssertion.commodity);
          const expected = parseDecimal(posting.balanceAssertion.quantity);
          if (compareDecimals(actual, expected) !== 0) {
            throw new Error(
              `Balance assertion failed at ${posting.location.source}:${posting.location.line}: ` +
            `expected ${formatDecimal(expected)} ${posting.balanceAssertion.commodity}, ` +
            `got ${formatDecimal(actual)} ${posting.balanceAssertion.commodity}`,
            );
          }
        }
      });

      const residuals = [...transactionBalance].filter(([commodity, residual]) => {
        if (compareDecimals(residual, ZERO) === 0) return false;
        const tolerance = transactionTolerances.get(commodity);
        return !calculatedCostCommodities.has(commodity) || !tolerance ||
        compareDecimals(absoluteDecimal(residual), tolerance) > 0;
      });
      if (implicitPosition !== null) {
        const posting = transaction.postings[implicitPosition];
        for (const [commodity, residual] of residuals) {
          const amount = { quantity: formatDecimal(negateDecimal(residual)), commodity };
          resolved[implicitPosition].push(amount);
          this.apply(posting.account, amount);
        }
      } else if (residuals.length > 0 && (hasCost || !isCommodityExchange(residuals))) {
        const imbalance = residuals
          .map(([commodity, residual]) => `${formatDecimal(residual)} ${commodity}`)
          .join(', ');
        throw new Error(
          `Transaction at ${transaction.location.source}:${transaction.location.line} ` +
        `does not balance: ${imbalance}`,
        );
      }

      return resolved;
    }
  }

  return { PostingResolver };
};
