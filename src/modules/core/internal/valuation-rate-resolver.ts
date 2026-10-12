'use strict';

type PriceRow = { date: string; base_commodity: string; quote_commodity: string; quote_quantity: string };

module.exports = ({
  decimal: {
    formatDecimal,
    multiplyDecimals,
    parseDecimal,
  },
  publicErrors: { createError, errorCodes },
  external: {
    zod: { z }
  },
}: any) => {

  const missingValuation = (message: string) => createError(errorCodes.MISSING_VALUATION_DATA, message);
  const resolverArgumentsSchema = z.tuple([
    z.string().min(1),
    z.string().optional(),
  ]);

  function createLedgerValuationRateResolver(priceRows: PriceRow[], valuationCommodity: string) {
    const histories = new Map<string, PriceRow[]>();
    for (const price of priceRows) {
      const history = histories.get(price.base_commodity) ?? [];
      history.push(price);
      histories.set(price.base_commodity, history);
    }
    const cache = new Map<string, string>();
    function resolve(commodity: string, throughDate: string, visiting: Set<string>): string {
      if (commodity === valuationCommodity) return '1';
      const key = `${commodity}\0${throughDate}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      if (visiting.has(commodity)) {
        throw missingValuation(
          `Circular price chain while converting ${commodity} to ${valuationCommodity}`,
        );
      }
      const eligible = (histories.get(commodity) ?? [])
        .filter((price) => price.date <= throughDate);
      // Ledger prefers a direct quote even when a newer indirect quote exists.
      const direct = eligible.slice().reverse().find((price) => price.quote_commodity === valuationCommodity);
      if (direct) {
        cache.set(key, direct.quote_quantity);
        return direct.quote_quantity;
      }
      visiting.add(commodity);
      for (let index = eligible.length - 1; index >= 0; index -= 1) {
        const price = eligible[index];
        try {
          const quoteRate = resolve(price.quote_commodity, throughDate, visiting);
          const rate = formatDecimal(multiplyDecimals(
            parseDecimal(price.quote_quantity),
            parseDecimal(quoteRate),
          ));
          cache.set(key, rate);
          visiting.delete(commodity);
          return rate;
        } catch (error: unknown) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== errorCodes.MISSING_VALUATION_DATA ||
              !error.message.startsWith('No price for ')) throw error;
        }
      }
      visiting.delete(commodity);
      throw missingValuation(
        `No price for ${commodity} on or before ${throughDate} can convert it to ${valuationCommodity}`,
      );
    }
    return (commodity: unknown, throughDate: unknown): string => {
      const result = resolverArgumentsSchema.safeParse([commodity, throughDate]);
      if (!result.success) {
        throw createError(
          errorCodes.INVALID_API_INPUT,
          `Invalid valuation-rate arguments: ${result.error.issues[0].message}`,
          TypeError,
        );
      }
      return resolve(result.data[0], result.data[1], new Set());
    };
  }

  return {
    createLedgerValuationRateResolver,
  };
};
