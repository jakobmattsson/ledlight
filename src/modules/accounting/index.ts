'use strict';

import type { LedgerAmount, LedgerCost, LedgerEntry, LedgerPosting, LedgerSyntaxTree } from '../../public-api';

type Fraction = { n: bigint; d: bigint };
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
  resolve(transaction: Transaction): LedgerAmount[][] | null;
};

type Facade = {
  commodityMovements: {
    annotatedTotal(annotation: LedgerCost | null, quantity: Fraction): Fraction | null;
    carriedMovements(transaction: Transaction, valuationCommodity: string): Movement[];
  };
  inferEffectivePostingCosts(entries: LedgerEntry[], valuationCommodity: string, warnings: Warning[]): void;
  validateGlobalAccounting(entries: LedgerEntry[], resolvedTransactions: Map<Transaction, LedgerAmount[][]>, valuationCommodity: string, warnings: Warning[]): void;
  journalValidator: {
    validateJournal(journal: { entries: LedgerEntry[] }, defaultCommodity: string | null | undefined, initialWarnings?: Warning[]): JournalValidation;
    validateResolvedCommodityTrades(transaction: Transaction, resolved: LedgerAmount[][], defaultCommodity: string | null | undefined, warnings: Warning[]): void;
  };
  valuationCommodityFromJournal(journal: LedgerSyntaxTree & { journalPath?: string }, suppliedWarnings: Warning[], ignoredProperties?: Set<{ name: string; location: { source: string; line: number; column: number; } }>): string | null;
  PostingResolver: new (warnings: Warning[]) => PostingResolverInstance;
};
type Registrations = {
  commodityMovements: Facade['commodityMovements'];
  effectivePostingCosts: Pick<Facade, 'inferEffectivePostingCosts'>;
  globalAccountingValidator: Pick<Facade, 'validateGlobalAccounting'>;
  journalValidator: Facade['journalValidator'];
  journalValuationCommodity: Pick<Facade, 'valuationCommodityFromJournal'>;
  postingResolver: Pick<Facade, 'PostingResolver'>;
};

export = ({
  commodityMovements: { annotatedTotal, carriedMovements },
  effectivePostingCosts: { inferEffectivePostingCosts },
  globalAccountingValidator: { validateGlobalAccounting },
  journalValidator,
  journalValuationCommodity: { valuationCommodityFromJournal },
  postingResolver: { PostingResolver },
}: Registrations): Facade => ({
  commodityMovements: { annotatedTotal, carriedMovements },
  inferEffectivePostingCosts, validateGlobalAccounting, journalValidator,
  valuationCommodityFromJournal, PostingResolver,
});
