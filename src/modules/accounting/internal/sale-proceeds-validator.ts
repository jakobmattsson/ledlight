'use strict';

import type { LedgerAmount, LedgerEntry, LedgerPosting } from '../../../public-api';

type Fraction = { n: bigint; d: bigint };
type Transaction = Extract<LedgerEntry, { type: 'transaction' }>;
type Core = ReturnType<typeof import('../../core')>;
type Journal = ReturnType<typeof import('../../journal')>;
type Movements = ReturnType<typeof import('./commodity-movements')>;
type Dependencies = {
  core: Pick<Core, 'rational'>;
  commodityMovements: Pick<Movements, 'annotatedTotal'>;
  journal: Pick<Journal, 'ingestionWarning'>;
};
type Result = { validateSaleProceeds(
  transaction: Transaction, resolved: LedgerAmount[][], valuationCommodity: string,
  carried: Set<LedgerPosting>, roundingUnit: Fraction, warnings: unknown[],
): void };

export = ({
  core: {
    rational: { zero, parse, add, sub, neg, cmp, div, format },
  },
  commodityMovements: { annotatedTotal },
  journal: {
    ingestionWarning: { createWarning, warningCodes },
  },
}: Dependencies): Result => {
  // Account names do not identify settlement, fees, or realized results. Check
  // whether any partition of the monetary postings can explain the trade value.
  // A bounded search may be inconclusive; it must never manufacture a warning.
  function canExplainSettlement(amounts: Fraction[], target: Fraction, tolerance: Fraction): boolean | null {
    const absolute = (value: Fraction): Fraction => value.n < 0n ? neg(value) : value;
    const ordered = amounts.filter((value) => value.n)
      .sort((left, right) => cmp(absolute(right), absolute(left)));
    const lower = [zero];
    const upper = [zero];
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      lower.unshift(add(lower[0], ordered[index].n < 0n ? ordered[index] : zero));
      upper.unshift(add(upper[0], ordered[index].n > 0n ? ordered[index] : zero));
    }
    const pending = [{ index: 0, remaining: target }];
    const visited = new Set<string>();
    while (pending.length) {
      const { index, remaining } = pending.pop()!;
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

  function validateSaleProceeds(transaction: Transaction, resolved: LedgerAmount[][], valuationCommodity: string,
    carried: Set<LedgerPosting>, roundingUnit: Fraction, warnings: unknown[]): void {
    let tradeValue = zero;
    let hasSale = false;
    const monetaryAmounts: Fraction[] = [];
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
        tradeValue = add(tradeValue, annotatedTotal(annotation, quantity)!);
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
