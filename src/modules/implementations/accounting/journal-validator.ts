'use strict';

import type { LedgerAmount, LedgerCost, LedgerEntry, LedgerPosting, LedgerTag, SourceLocation } from '../../../public-api';

type Transaction = Extract<LedgerEntry, { type: 'transaction' }>;
type Declarations = { accounts: Set<string>; commodities: Set<string>; tags: Set<string> };
type LocatedTag = LedgerTag & { location?: SourceLocation };
type ResolvedPosting = LedgerPosting & { amount: LedgerAmount; original: LedgerPosting };
type Numeric = ReturnType<typeof import('../../interfaces/numeric')>;
type Journal = ReturnType<typeof import('../../interfaces/journal')>;
type Movements = ReturnType<typeof import('./commodity-movements')>;
type Valuation = ReturnType<typeof import('./journal-valuation-commodity')>;
type Warning = ReturnType<Journal['ingestionWarning']['createWarning']>;
type JournalValidation = { invalidEntries: Set<LedgerEntry>; journal: { entries: LedgerEntry[] }; warnings: Warning[] };
type Result = {
  validateJournal(journal: { entries: LedgerEntry[] }, defaultCommodity: string | null | undefined,
    initialWarnings?: Warning[]): JournalValidation;
  validateResolvedCommodityTrades(transaction: Transaction, resolved: LedgerAmount[][],
    defaultCommodity: string | null | undefined, warnings: unknown[]): void;
};
type Dependencies = {
  numeric: Pick<Numeric, 'decimal' | 'rational'>;
  commodityMovements: Movements;
  journal: Pick<Journal, 'ingestionWarning'>;
  journalValuationCommodity: Valuation;
};

export = ({
  numeric: {
    decimal: { compareDecimals, parseDecimal },
    rational: { zero, parse: parseRational, add, cmp },
  },
  commodityMovements: { annotatedTotal, carriedMovements, unpricedReplacement },
  journal: {
    ingestionWarning: { createWarning, warningCodes },
  },
  journalValuationCommodity: { valuationCommodityFromJournal },
}: Dependencies): Result => {

  const ZERO = parseDecimal('0');

  function warnUnlessDeclared(kind: 'account' | 'commodity' | 'tag', name: string | null | undefined, declarations: Set<string>, location: SourceLocation, warnings: unknown[]): void {
    if (name === null || name === undefined || declarations.has(name)) return;
    const label = kind[0].toUpperCase() + kind.slice(1);
    warnings.push(createWarning(
      warningCodes[`UNDECLARED_${kind.toUpperCase()}` as keyof typeof warningCodes],
      `${label} ${name} must be declared before use`,
      location,
    ));
  }

  function declare(kind: 'account' | 'commodity' | 'tag', name: string, declarations: Set<string>, location: SourceLocation, warnings: unknown[]): boolean {
    const label = kind[0].toUpperCase() + kind.slice(1);
    if (declarations.has(name)) {
      warnings.push(createWarning(
        warningCodes[`DUPLICATE_${kind.toUpperCase()}_DECLARATION` as keyof typeof warningCodes],
        `${label} ${name} has already been declared`,
        location,
      ));
      return false;
    }
    declarations.add(name);
    return true;
  }

  function validatePostingDeclarations(posting: LedgerPosting, declarations: Declarations, warnings: unknown[]): void {
    warnUnlessDeclared(
      'account', posting.account, declarations.accounts, posting.location, warnings,
    );
    for (const amount of [
      posting.amount,
      posting.lotCost?.amount,
      posting.cost?.amount,
      posting.balanceAssignment,
      posting.balanceAssertion,
    ]) {
      warnUnlessDeclared(
        'commodity', amount?.commodity, declarations.commodities, posting.location, warnings,
      );
    }
    for (const tag of (posting.tags || []) as LocatedTag[]) {
      warnUnlessDeclared('tag', tag.name, declarations.tags, tag.location || posting.location, warnings);
    }
  }

  function validateTransactionDeclarations(transaction: Transaction, declarations: Declarations, warnings: unknown[]): void {
    for (const tag of (transaction.tags || []) as LocatedTag[]) {
      warnUnlessDeclared('tag', tag.name, declarations.tags, tag.location || transaction.location, warnings);
    }
    for (const posting of transaction.postings) {
      validatePostingDeclarations(posting, declarations, warnings);
    }
  }

  function validatePostingDates(transaction: Transaction, warnings: unknown[]): void {
    for (const posting of transaction.postings) {
      if (posting.postingDate && posting.postingDate < transaction.date) {
        warnings.push(createWarning(
          warningCodes.POSTING_DATE_BEFORE_TRANSACTION,
          `Posting date ${posting.postingDate} must not precede transaction date ${transaction.date}`,
          posting.location,
        ));
      }
    }
  }

  function validateCommodityTrade(posting: LedgerPosting, defaultCommodity: string | null | undefined, warnings: unknown[]): void {
    if (!posting.amount || !defaultCommodity) return;
    if (posting.amount.commodity === defaultCommodity) {
      for (const [label, annotation] of ([
        ['lot cost', posting.lotCost], ['transaction price', posting.cost],
      ] as Array<[string, LedgerCost | null]>)) {
        if (annotation && annotation.amount.commodity !== defaultCommodity) {
          warnings.push(createWarning(
            warningCodes.INVALID_COMMODITY_TRADE,
            `A ${defaultCommodity} posting cannot have a ${label} in ` +
              `${annotation.amount.commodity}. Amounts in the default commodity are valued at face value.`,
            posting.location,
          ));
        }
      }
      return;
    }
    const sign = compareDecimals(parseDecimal(posting.amount.quantity), ZERO);
    if (sign > 0 && !posting.lotCost) {
      warnings.push(createWarning(
        warningCodes.INVALID_COMMODITY_TRADE,
        `Positive ${posting.amount.commodity} posting must use a lot cost ({...} or {{...}}); ` +
        `the default commodity is ${defaultCommodity}`,
        posting.location,
      ));
    }
    if (sign < 0 && (!posting.lotCost || !posting.cost)) {
      warnings.push(createWarning(
        warningCodes.INVALID_COMMODITY_TRADE,
        `Negative ${posting.amount.commodity} posting must use both a lot cost ({...} or {{...}}) ` +
        `and a transaction price (@ or @@); the default commodity is ${defaultCommodity}`,
        posting.location,
      ));
    }
  }

  function validateSelfCommodityCosts(posting: LedgerPosting, warnings: unknown[]): void {
    if (!posting.amount?.commodity) return;
    const { commodity, quantity } = posting.amount;
    for (const [label, annotation] of ([
      ['Lot cost', posting.lotCost], ['Transaction price', posting.cost],
    ] as Array<[string, LedgerCost | null]>)) {
      if (!annotation || annotation.amount.commodity !== commodity) continue;
      const expected = parseRational(annotation.total ? quantity : '1');
      const actual = annotation.total
        ? annotatedTotal(annotation, expected)
        : parseRational(annotation.amount.quantity);
      if (cmp(actual!, expected) !== 0) {
        warnings.push(createWarning(
          warningCodes.INVALID_COMMODITY_TRADE,
          `${label} expressed in the posting commodity ${commodity} ` +
            `must value one ${commodity} at exactly one ${commodity}`,
          posting.location,
        ));
      }
    }
  }

  function validatePosting(posting: LedgerPosting, defaultCommodity: string | null | undefined, warnings: unknown[], carried: Set<LedgerPosting>): void {
    if (posting.lotCost) {
      const costCommodity = posting.lotCost.amount.commodity;
      if (defaultCommodity && costCommodity && costCommodity !== defaultCommodity &&
          posting.amount?.commodity !== defaultCommodity) {
        warnings.push(createWarning(
          warningCodes.FOREIGN_LOT_COST_CURRENCY,
          `${posting.account}: lot cost in ${costCommodity} must be expressed in ` +
          `the default commodity ${defaultCommodity}. Unrealized gains omit affected positions; ` +
          'their totals may be incomplete',
          posting.location,
        ));
      }
    }
    validateSelfCommodityCosts(posting, warnings);
    if (!carried.has(posting)) validateCommodityTrade(posting, defaultCommodity, warnings);
  }

  function validateResolvedCommodityTrades(transaction: Transaction, resolved: LedgerAmount[][], defaultCommodity: string | null | undefined, warnings: unknown[]): void {
    const postings: ResolvedPosting[] = transaction.postings.flatMap((posting, index) =>
      resolved[index].map((amount) => ({ ...posting, amount, original: posting })));
    const carried = new Set<LedgerPosting>(carriedMovements({ ...transaction, postings }, defaultCommodity)
      .flatMap(({ outgoing, incoming }: { outgoing: LedgerPosting; incoming: LedgerPosting }) => [outgoing, incoming]));
    const replacement = unpricedReplacement({ ...transaction, postings }, defaultCommodity);
    if (replacement) { carried.add(replacement.outgoing); carried.add(replacement.incoming); }
    for (const posting of postings) {
      // Explicit amounts were checked before resolution. Assignments must use
      // the actual change in holdings, not the target balance's sign.
      if (posting.original.amount && !posting.original.balanceAssignment) continue;
      if (!posting.original.amount && !posting.original.balanceAssignment &&
          postings.some((candidate) => candidate !== posting && candidate.original.amount &&
            candidate.amount.commodity === posting.amount.commodity &&
            cmp(add(parseRational(candidate.amount.quantity),
              parseRational(posting.amount.quantity)), zero) === 0 &&
            !candidate.cost && !posting.cost)) continue;
      validateSelfCommodityCosts(posting, warnings);
      if (!carried.has(posting)) validateCommodityTrade(posting, defaultCommodity, warnings);
    }
  }

  function validateJournal(journal: { entries: LedgerEntry[] }, defaultCommodity: string | null | undefined, initialWarnings?: Warning[]): JournalValidation {
    const warnings = [...(initialWarnings || [])];
    const invalidEntries = new Set<LedgerEntry>();
    const effectiveDefaultCommodity = defaultCommodity === undefined
      ? valuationCommodityFromJournal(journal, warnings)
      : defaultCommodity;
    const declarations = {
      accounts: new Set<string>(),
      commodities: new Set<string>(),
      tags: new Set<string>(),
    };
    for (const entry of journal.entries) {
      if (entry.type === 'account') {
        if (!declare('account', entry.name, declarations.accounts, entry.location, warnings)) {
          invalidEntries.add(entry);
        }
      } else if (entry.type === 'commodity') {
        if (!declare(
          'commodity', entry.symbol, declarations.commodities, entry.location, warnings,
        )) {
          invalidEntries.add(entry);
        } else if (!entry.properties.some(({ name }) => name === 'format')) {
          warnings.push(createWarning(
            warningCodes.MISSING_COMMODITY_FORMAT,
            `Commodity ${entry.symbol} must declare a format property`,
            entry.location,
          ));
        }
      } else if (entry.type === 'tag') {
        if (!declare('tag', entry.name, declarations.tags, entry.location, warnings)) {
          invalidEntries.add(entry);
        }
      } else if (entry.type === 'transaction') {
        validateTransactionDeclarations(entry, declarations, warnings);
        validatePostingDates(entry, warnings);
        const carried = new Set<LedgerPosting>(carriedMovements(entry, effectiveDefaultCommodity)
          .flatMap(({ outgoing, incoming }: { outgoing: LedgerPosting; incoming: LedgerPosting }) => [outgoing, incoming]));
        const replacement = unpricedReplacement(entry, effectiveDefaultCommodity);
        if (replacement) { carried.add(replacement.outgoing); carried.add(replacement.incoming); }
        if (entry.postings.length === 2 && entry.postings.every((posting) =>
          posting.amount && !posting.lotCost && !posting.cost) &&
          entry.postings[0].amount!.commodity === entry.postings[1].amount!.commodity &&
          cmp(add(parseRational(entry.postings[0].amount!.quantity),
            parseRational(entry.postings[1].amount!.quantity)), zero) === 0) {
          const outgoing = entry.postings.find((posting) =>
            parseRational(posting.amount!.quantity).n < 0n);
          if (outgoing) carried.add(outgoing);
        }
        entry.postings.forEach((posting) => validatePosting(
          posting, effectiveDefaultCommodity, warnings, carried,
        ));
      } else if (entry.type === 'price') {
        warnUnlessDeclared(
          'commodity', entry.commodity, declarations.commodities, entry.location, warnings,
        );
        warnUnlessDeclared(
          'commodity', entry.price?.commodity, declarations.commodities, entry.location, warnings,
        );
      }
    }
    return { invalidEntries, journal, warnings };
  }

  return { validateJournal, validateResolvedCommodityTrades };
};
