'use strict';

module.exports = ({
  core: {
    decimal: {
      addDecimals,
      compareDecimals,
      formatDecimal,
      multiplyDecimals,
      negateDecimal,
      parseDecimal,
      subtractDecimals,
    },
  },
  journal: {
    ingestionWarning: { createWarning, warningCodes },
  },
}: any) => {

  const ZERO = parseDecimal('0');

  function balanceKey(account: any, commodity: any) {
    return `${account}\u0000${commodity}`;
  }

  function addToMap(map: any, key: any, value: any) {
    map.set(key, addDecimals(map.get(key) || ZERO, value));
  }

  function isCommodityExchange(residuals: any) {
    return residuals.length === 2 &&
    (residuals[0][1].coefficient < 0n) !== (residuals[1][1].coefficient < 0n);
  }

  function balancingCost(posting: any, postings: any) {
    if (posting.cost) return posting.lotCost || posting.cost;
    if (!posting.lotCost) return null;
    const costCommodity = posting.lotCost.amount.commodity;
    const hasImplicitPosting = postings.some((candidate: any) =>
      !candidate.amount && !candidate.balanceAssignment);
    const hasMatchingPosting = postings.some((candidate: any) =>
      candidate !== posting &&
      (candidate.amount?.commodity || candidate.balanceAssignment?.commodity) === costCommodity);
    const samePostingCommodity = postings.length > 1 && postings.every((candidate: any) =>
      (candidate.amount?.commodity || candidate.balanceAssignment?.commodity) ===
        posting.amount?.commodity);
    return hasImplicitPosting || hasMatchingPosting || samePostingCommodity
      ? posting.lotCost : null;
  }

  function balancingAmount(annotation: any, amount: any) {
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
    balances: any;
    warnings: any;
    constructor(warnings: any) {
      this.balances = new Map();
      this.warnings = warnings || [];
    }

    accountBalance(account: any, commodity: any) {
      return this.balances.get(balanceKey(account, commodity)) || ZERO;
    }

    apply(account: any, amount: any) {
      addToMap(this.balances, balanceKey(account, amount.commodity), parseDecimal(amount.quantity));
    }

    resolve(transaction: any) {
      const balancesBeforeTransaction = new Map(this.balances);
      const resolved = transaction.postings.map(() => []);
      const transactionBalance = new Map();
      let implicitPosition: number | null = null;
      let hasCost = false;
      let invalidTransaction = false;

      transaction.postings.forEach((posting: any, position: any) => {
        if (invalidTransaction) return;
        const annotation = balancingCost(posting, transaction.postings);
        if (annotation) hasCost = true;
        let amount = posting.amount;
        if (posting.balanceAssignment) {
          const { commodity } = posting.balanceAssignment;
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
        const balancing = balancingAmount(annotation, amount);
        addToMap(transactionBalance, balancing.commodity, parseDecimal(balancing.quantity));

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

      const residuals = [...transactionBalance].filter(([, residual]: any) =>
        compareDecimals(residual, ZERO) !== 0);
      if (implicitPosition !== null) {
        const posting = transaction.postings[implicitPosition];
        for (const [commodity, residual] of residuals) {
          const amount: any = { quantity: formatDecimal(negateDecimal(residual)), commodity };
          resolved[implicitPosition].push(amount);
          this.apply(posting.account, amount);
        }
      } else if (residuals.length > 0 && (hasCost || !isCommodityExchange(residuals))) {
        const imbalance = residuals
          .map(([commodity, residual]: any) => `${formatDecimal(residual)} ${commodity}`)
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
