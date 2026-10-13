'use strict';

import type { LedgerAmount, LedgerCost, LedgerEntry, LedgerPosting, LedgerSyntaxTree } from '../../public-api';

type Fraction = { n: bigint; d: bigint };
type Decimal = { coefficient: bigint; scale: number };
type Transaction = Extract<LedgerEntry, { type: 'transaction' }>;
type Movement = { outgoing: LedgerPosting; incoming: LedgerPosting };
type Warning = {
  code: string; message: string; source: string; line: number; column: number;
  startLine: number; endLine: number;
};
type JournalValidation = {
  invalidEntries: Set<LedgerEntry>;
  journal: { entries: LedgerEntry[] };
  warnings: Warning[];
};
type PostingResolverInstance = {
  balances: Map<string, Decimal>;
  warnings: Warning[];
  accountBalance(account: string, commodity: string): Decimal;
  apply(account: string, amount: LedgerAmount): void;
  resolve(transaction: Transaction): LedgerAmount[][] | null;
};

type Facade = {
  commodityMovements: {
    annotatedTotal(annotation: LedgerCost | null, quantity: Fraction): Fraction | null;
    carriedMovements(transaction: Transaction, valuationCommodity: string): Movement[];
    unpricedReplacement(transaction: Transaction, valuationCommodity: string): Movement | null;
  };
  effectivePostingCosts: {
    inferEffectivePostingCosts(entries: LedgerEntry[], valuationCommodity: string, warnings: Warning[]): void;
  };
  globalAccountingValidator: {
    validateGlobalAccounting(entries: LedgerEntry[], resolvedTransactions: Map<Transaction, LedgerAmount[][]>,
      valuationCommodity: string, warnings: Warning[]): void;
  };
  journalValidator: {
    validateJournal(journal: { entries: LedgerEntry[] }, defaultCommodity: string | null | undefined,
      initialWarnings?: Warning[]): JournalValidation;
    validateResolvedCommodityTrades(transaction: Transaction, resolved: LedgerAmount[][],
      defaultCommodity: string | null | undefined, warnings: Warning[]): void;
  };
  journalValuationCommodity: {
    valuationCommodityFromJournal(journal: LedgerSyntaxTree & { journalPath?: string },
      suppliedWarnings: Warning[], ignoredProperties?: Set<{ name: string; location: {
        source: string; line: number; column: number;
      } }>): string | null;
  };
  postingResolver: { PostingResolver: new (warnings: Warning[]) => PostingResolverInstance };
};

export = ({
  commodityMovements, effectivePostingCosts, globalAccountingValidator, journalValidator, journalValuationCommodity, postingResolver,
}: Facade): Facade => ({
  commodityMovements, effectivePostingCosts, globalAccountingValidator, journalValidator, journalValuationCommodity, postingResolver,
});
