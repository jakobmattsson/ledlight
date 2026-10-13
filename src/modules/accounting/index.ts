'use strict';

type Facade = {
  commodityMovements: ReturnType<typeof import('./internal/commodity-movements')>;
  effectivePostingCosts: ReturnType<typeof import('./internal/effective-posting-costs')>;
  globalAccountingValidator: ReturnType<typeof import('./internal/global-accounting-validator')>;
  journalValidator: ReturnType<typeof import('./internal/journal-validator')>;
  journalValuationCommodity: ReturnType<typeof import('./internal/journal-valuation-commodity')>;
  postingResolver: ReturnType<typeof import('./internal/posting-resolver')>;
};

export = ({
  commodityMovements, effectivePostingCosts, globalAccountingValidator, journalValidator, journalValuationCommodity, postingResolver,
}: Facade): Facade => ({
  commodityMovements, effectivePostingCosts, globalAccountingValidator, journalValidator, journalValuationCommodity, postingResolver,
});
