'use strict';

type Decimal = { coefficient: bigint; scale: number };
type SqlDecimal = string | null;
type DecimalDatabase = {
  aggregate(name: string, options: {
    start: () => Decimal;
    step: (total: Decimal, value: SqlDecimal) => Decimal;
    result: (total: Decimal) => string;
  }): void;
  function(name: string, options: { deterministic: boolean }, callback: (left: SqlDecimal, right: SqlDecimal) => string | number | null): void;
};

export = ({ core: { decimal: { addDecimals, compareDecimals, formatDecimal, multiplyDecimals, parseDecimal } } }: {
  core: { decimal: {
    addDecimals(left: Decimal, right: Decimal): Decimal;
    compareDecimals(left: Decimal, right: Decimal): number;
    formatDecimal(value: Decimal): string;
    multiplyDecimals(left: Decimal, right: Decimal): Decimal;
    parseDecimal(value: string): Decimal;
  } };
}) => {
  function registerDecimalFunctions(database: DecimalDatabase) {
    database.aggregate('decimal_sum', {
      start: () => ({ coefficient: 0n, scale: 0 }),
      step: (total: Decimal, value: SqlDecimal) => value === null
        ? total
        : addDecimals(total, parseDecimal(value)),
      result: formatDecimal,
    });
    database.function('decimal_mul', { deterministic: true }, (left: SqlDecimal, right: SqlDecimal) => {
      if (left === null || right === null) return null;
      return formatDecimal(multiplyDecimals(parseDecimal(left), parseDecimal(right)));
    });
    database.function('decimal_add', { deterministic: true }, (left: SqlDecimal, right: SqlDecimal) => {
      if (left === null || right === null) return null;
      return formatDecimal(addDecimals(parseDecimal(left), parseDecimal(right)));
    });
    database.function('decimal_cmp', { deterministic: true }, (left: SqlDecimal, right: SqlDecimal) => {
      if (left === null || right === null) return null;
      return compareDecimals(parseDecimal(left), parseDecimal(right));
    });
  }

  return { registerDecimalFunctions };
};
