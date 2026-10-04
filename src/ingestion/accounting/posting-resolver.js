'use strict';

module.exports = ({
  decimal: {
    addDecimals,
    compareDecimals,
    formatDecimal,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
    subtractDecimals,
  },
  ingestionWarning: { createWarning, warningCodes },
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

  function balancingCost(posting) {
    return posting.lotCost || posting.cost;
  }

  function balancingAmount(posting, amount) {
    const annotation = balancingCost(posting);
    if (!annotation) return amount;
    const cost = parseDecimal(annotation.amount.quantity);
    let quantity;
    if (annotation.total) {
      const amountSign = compareDecimals(parseDecimal(amount.quantity), ZERO);
      quantity = amountSign < 0 && compareDecimals(cost, ZERO) > 0 ? negateDecimal(cost) : cost;
    } else {
      quantity = multiplyDecimals(parseDecimal(amount.quantity), cost);
    }
    return { quantity: formatDecimal(quantity), commodity: annotation.amount.commodity };
  }

  class PostingResolver {
    constructor(warnings) {
      this.balances = new Map();
      this.warnings = warnings || [];
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
        this.warnings.push(createWarning(
          warningCodes.AMBIGUOUS_BALANCE_ASSIGNMENT,
          'Cannot infer balance assignment commodity',
          posting.location,
        ));
        return null;
      }
      return commodities[0];
    }

    apply(account, amount) {
      addToMap(this.balances, balanceKey(account, amount.commodity), parseDecimal(amount.quantity));
    }

    resolve(transaction) {
      const balancesBeforeTransaction = new Map(this.balances);
      const resolved = transaction.postings.map(() => []);
      const transactionBalance = new Map();
      const transactionTolerances = new Map();
      const calculatedCostCommodities = new Set();
      let implicitPosition = null;
      let hasCost = false;
      let invalidTransaction = false;

      transaction.postings.forEach((posting, position) => {
        if (invalidTransaction) return;
        const annotation = balancingCost(posting);
        if (annotation) hasCost = true;
        let amount = posting.amount;
        if (posting.balanceAssignment) {
          const commodity = this.assignmentCommodity(posting);
          if (commodity === null) {
            invalidTransaction = true;
            return;
          }
          const target = parseDecimal(posting.balanceAssignment.quantity);
          const current = this.accountBalance(posting.account, commodity);
          amount = {
            quantity: formatDecimal(subtractDecimals(target, current)),
            commodity,
          };
        } else if (!amount) {
          if (implicitPosition !== null) {
            this.warnings.push(createWarning(
              warningCodes.MULTIPLE_IMPLICIT_POSTINGS,
              'Transaction has multiple implicit postings',
              transaction.location,
            ));
            invalidTransaction = true;
            return;
          }
          implicitPosition = position;
          return;
        }

        resolved[position].push(amount);
        this.apply(posting.account, amount);
        const balancing = balancingAmount(posting, amount);
        addToMap(transactionBalance, balancing.commodity, parseDecimal(balancing.quantity));
        if (annotation && !annotation.total) {
          calculatedCostCommodities.add(balancing.commodity);
        } else {
          const quantity = annotation
            ? annotation.amount.quantity
            : posting.balanceAssignment?.quantity || amount.quantity;
          recordTolerance(transactionTolerances, balancing.commodity, quantity);
        }

        if (posting.balanceAssertion) {
          const actual = this.accountBalance(posting.account, posting.balanceAssertion.commodity);
          const expected = parseDecimal(posting.balanceAssertion.quantity);
          if (compareDecimals(actual, expected) !== 0) {
            this.warnings.push(createWarning(
              warningCodes.BALANCE_ASSERTION_FAILED,
              `Balance assertion failed: expected ${formatDecimal(expected)} ` +
                `${posting.balanceAssertion.commodity}, got ${formatDecimal(actual)} ` +
                posting.balanceAssertion.commodity,
              posting.location,
            ));
          }
        }
      });

      if (invalidTransaction) {
        this.balances = balancesBeforeTransaction;
        return null;
      }

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
        this.warnings.push(createWarning(
          warningCodes.UNBALANCED_TRANSACTION,
          `Transaction does not balance: ${imbalance}`,
          transaction.location,
        ));
      }

      return resolved;
    }
  }

  return { PostingResolver };
};
