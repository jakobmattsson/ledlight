'use strict';

import type { InvestmentPerformanceOptions, LedgerAmount, LedgerCost } from '../../../../public-api';

type Fraction = { n: bigint; d: bigint };
type Posting = { transactionId: number; date: string; account: string; amount: LedgerAmount;
  lotCost: LedgerCost | null; cost: LedgerCost | null; marketRate: string | null;
  lotRate: string | null; costRate: string | null; selectedAccount: boolean; selected: boolean };


module.exports = ({
  core: {
    publicErrors: { createError, errorCodes },
  },
  numeric: {
    rational: { zero, parse, add, mul, neg, format },
  },
  accounting: {
    commodityMovements: { annotatedTotal, carriedMovements },
  },
}: any) => {
  function calculateFlows(postings: Posting[], options: InvestmentPerformanceOptions, valuationCommodity: string) {
    const transactions = new Map<number, Posting[]>();
    for (const posting of postings) {
      if (!transactions.has(posting.transactionId)) transactions.set(posting.transactionId, []);
      transactions.get(posting.transactionId)!.push(posting);
    }
    const daily = new Map<string, Fraction>();
    const addFlow = (date: string, value: Fraction) => daily.set(date, add(daily.get(date) || zero, value));
    const inPeriod = (date: string) => (!options.from || date >= options.from) && (!options.to || date <= options.to);
    const convert = (quantity: Fraction, rate: string | null, commodity: string, date: string) => {
      if (!quantity.n) return zero;
      if (rate === null) {
        throw createError(errorCodes.MISSING_VALUATION_DATA,
          `No price for ${commodity} on or before ${date} can convert a cash flow to ${valuationCommodity}`);
      }
      return mul(quantity, parse(rate));
    };
    const marketValue = (posting: Posting) => convert(parse(posting.amount.quantity), posting.marketRate,
      posting.amount.commodity, posting.date);

    for (const transaction of transactions.values()) {
      const paired = new Set<Posting>();
      const internal = new Set<Posting>();
      for (const { outgoing, incoming } of carriedMovements({ postings: transaction }, valuationCommodity)) {
        paired.add(outgoing);
        paired.add(incoming);
        if (outgoing.selected && incoming.selected && outgoing.date === incoming.date) {
          internal.add(outgoing);
          internal.add(incoming);
        }
      }
      const groups = new Map<string, Posting[]>();
      for (const posting of transaction) {
        if (!posting.selectedAccount || !inPeriod(posting.date)) continue;
        const key = JSON.stringify([posting.date, posting.account]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(posting);
      }
      for (const group of groups.values()) {
        const selected = group.filter((posting: Posting) => posting.selected && !internal.has(posting));
        if (!selected.length) continue;
        const annotationFor = (posting: Posting) => parse(posting.amount.quantity).n < 0n
          ? posting.cost : posting.lotCost;
        const incomplete = selected.some((posting: Posting) => posting.amount.commodity !== valuationCommodity &&
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
    return [...daily].sort(([left], [right]: any) => left.localeCompare(right))
      .map(([date, flow]) => ({ date, flow: Number(format(flow)) }));
  }

  return { calculateFlows };
};
