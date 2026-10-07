'use strict';

module.exports = ({
  decimal: { compareDecimals, parseDecimal },
  rational: { parse: parseRational, cmp },
  commodityMovements: { annotatedTotal, carriedMovements },
  ingestionWarning: { createWarning, warningCodes },
  journalValuationCommodity: { valuationCommodityFromJournal },
}) => {

  const ZERO = parseDecimal('0');

  function warnUnlessDeclared(kind, name, declarations, location, warnings) {
    if (name === null || name === undefined || declarations.has(name)) return;
    const label = kind[0].toUpperCase() + kind.slice(1);
    warnings.push(createWarning(
      warningCodes[`UNDECLARED_${kind.toUpperCase()}`],
      `${label} ${name} must be declared before use`,
      location,
    ));
  }

  function declare(kind, name, declarations, location, warnings) {
    const label = kind[0].toUpperCase() + kind.slice(1);
    if (declarations.has(name)) {
      warnings.push(createWarning(
        warningCodes[`DUPLICATE_${kind.toUpperCase()}_DECLARATION`],
        `${label} ${name} has already been declared`,
        location,
      ));
      return false;
    }
    declarations.add(name);
    return true;
  }

  function validatePostingDeclarations(posting, declarations, warnings) {
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
    for (const comment of posting.comments || []) {
      for (const tag of comment.tags || []) {
        warnUnlessDeclared('tag', tag.name, declarations.tags, comment.location, warnings);
      }
    }
  }

  function validateTransactionDeclarations(transaction, declarations, warnings) {
    for (const comment of transaction.comments) {
      for (const tag of comment.tags || []) {
        warnUnlessDeclared('tag', tag.name, declarations.tags, comment.location, warnings);
      }
    }
    for (const posting of transaction.postings) {
      validatePostingDeclarations(posting, declarations, warnings);
    }
  }

  function requireCommodity(amount, label, location, warnings) {
    if (!amount || typeof amount.commodity !== 'string' || amount.commodity.length === 0) {
      warnings.push(createWarning(
        warningCodes.MISSING_COMMODITY,
        `${label} must specify a commodity`,
        location,
      ));
      return false;
    }
    return true;
  }

  function validateCommodityTrade(posting, defaultCommodity, warnings) {
    if (!posting.amount || !defaultCommodity) return;
    if (posting.amount.commodity === defaultCommodity) {
      for (const [label, annotation] of [
        ['lot cost', posting.lotCost], ['transaction price', posting.cost],
      ]) {
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
    const isZeroValueAcquisition = posting.lotCost && posting.cost &&
      compareDecimals(parseDecimal(posting.lotCost.amount.quantity), ZERO) === 0 &&
      compareDecimals(parseDecimal(posting.cost.amount.quantity), ZERO) === 0;
    if (sign > 0 && (!posting.lotCost || (posting.cost && !isZeroValueAcquisition))) {
      warnings.push(createWarning(
        warningCodes.INVALID_COMMODITY_TRADE,
        `Positive ${posting.amount.commodity} posting must use a lot cost ({...} or {{...}}) ` +
        `and no transaction price (@ or @@), except when both prices are zero; ` +
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

  function validateSelfCommodityCosts(posting, warnings) {
    if (!posting.amount?.commodity) return;
    const { commodity, quantity } = posting.amount;
    for (const [label, annotation] of [
      ['Lot cost', posting.lotCost], ['Transaction price', posting.cost],
    ]) {
      if (annotation?.amount.commodity !== commodity) continue;
      const expected = parseRational(annotation.total ? quantity : '1');
      const actual = annotation.total
        ? annotatedTotal(annotation, expected)
        : parseRational(annotation.amount.quantity);
      if (cmp(actual, expected) !== 0) {
        warnings.push(createWarning(
          warningCodes.INVALID_COMMODITY_TRADE,
          `${label} expressed in the posting commodity ${commodity} ` +
            `must value one ${commodity} at exactly one ${commodity}`,
          posting.location,
        ));
      }
    }
  }

  function validatePosting(posting, defaultCommodity, warnings, carried) {
    let storable = true;
    if (posting.amount) {
      storable = requireCommodity(
        posting.amount, 'Posting amount', posting.location, warnings,
      ) && storable;
    }
    if (posting.lotCost) {
      storable = requireCommodity(
        posting.lotCost.amount, 'Lot cost', posting.location, warnings,
      ) && storable;
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
    if (posting.cost) {
      storable = requireCommodity(
        posting.cost.amount, 'Posting cost', posting.location, warnings,
      ) && storable;
    }
    if (posting.balanceAssertion) {
      storable = requireCommodity(
        posting.balanceAssertion, 'Balance assertion', posting.location, warnings,
      ) && storable;
    }
    validateSelfCommodityCosts(posting, warnings);
    if (!carried.has(posting)) validateCommodityTrade(posting, defaultCommodity, warnings);
    return storable;
  }

  function validateResolvedCommodityTrades(transaction, resolved, defaultCommodity, warnings) {
    const postings = transaction.postings.flatMap((posting, index) =>
      resolved[index].map((amount) => ({ ...posting, amount, original: posting })));
    const carried = new Set(carriedMovements({ ...transaction, postings }, defaultCommodity)
      .flatMap(({ outgoing, incoming }) => [outgoing, incoming]));
    for (const posting of postings) {
      // Explicit amounts were checked before resolution. Assignments must use
      // the actual change in holdings, not the target balance's sign.
      if (posting.original.amount && !posting.original.balanceAssignment) continue;
      validateSelfCommodityCosts(posting, warnings);
      if (!carried.has(posting)) validateCommodityTrade(posting, defaultCommodity, warnings);
    }
  }

  function validateJournal(journal, defaultCommodity, initialWarnings) {
    const warnings = [...(initialWarnings || [])];
    const invalidEntries = new Set();
    const effectiveDefaultCommodity = defaultCommodity === undefined
      ? valuationCommodityFromJournal(journal, warnings)
      : defaultCommodity;
    const declarations = {
      accounts: new Set(),
      commodities: new Set(),
      tags: new Set(),
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
        const carried = new Set(carriedMovements(entry, effectiveDefaultCommodity)
          .flatMap(({ outgoing, incoming }) => [outgoing, incoming]));
        const postingResults = entry.postings.map((posting) => validatePosting(
          posting, effectiveDefaultCommodity, warnings, carried,
        ));
        if (!postingResults.every(Boolean)) invalidEntries.add(entry);
      } else if (entry.type === 'price') {
        warnUnlessDeclared(
          'commodity', entry.commodity, declarations.commodities, entry.location, warnings,
        );
        warnUnlessDeclared(
          'commodity', entry.price?.commodity, declarations.commodities, entry.location, warnings,
        );
        if (!requireCommodity(entry.price, 'Price', entry.location, warnings)) {
          invalidEntries.add(entry);
        }
      }
    }
    return { invalidEntries, journal, warnings };
  }

  return { validateJournal, validateResolvedCommodityTrades };
};
