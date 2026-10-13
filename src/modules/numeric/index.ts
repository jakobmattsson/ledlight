'use strict';

type Decimal = { coefficient: bigint; scale: number };
type Fraction = { n: bigint; d: bigint };
type Facade = {
  decimal: {
    addDecimals(left: Decimal, right: Decimal): Decimal;
    compareDecimals(left: Decimal, right: Decimal): number;
    divideDecimals(left: Decimal, right: Decimal, scale: number): Decimal;
    divideDecimalsHalfEven(left: Decimal, right: Decimal, scale: number): Decimal;
    formatDecimal(decimal: Decimal): string;
    formatDecimalFixed(decimal: Decimal, scale: number): string;
    multiplyDecimals(left: Decimal, right: Decimal): Decimal;
    negateDecimal(decimal: Decimal): Decimal;
    parseDecimal(value: string): Decimal;
    subtractDecimals(left: Decimal, right: Decimal): Decimal;
  };
  rational: {
    zero: Fraction;
    one: Fraction;
    neg(value: Fraction): Fraction;
    add(left: Fraction, right: Fraction): Fraction;
    sub(left: Fraction, right: Fraction): Fraction;
    mul(left: Fraction, right: Fraction): Fraction;
    div(left: Fraction, right: Fraction): Fraction;
    cmp(left: Fraction, right: Fraction): number;
    parse(value: string): Fraction;
    format(value: Fraction): string;
  };
};
type Registrations = Pick<Facade, 'decimal' | 'rational'>;

export = ({
  decimal,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
}: Registrations): Facade => ({
  decimal,
  rational: { zero, one, neg, add, sub, mul, div, cmp, parse, format },
});
