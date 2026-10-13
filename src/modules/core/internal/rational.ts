'use strict';

type Decimal = { coefficient: bigint; scale: number };
type Fraction = { n: bigint; d: bigint };
type RationalOperations = {
  zero: Fraction;
  one: Fraction;
  fraction(n: bigint, d: bigint): Fraction;
  neg(value: Fraction): Fraction;
  add(left: Fraction, right: Fraction): Fraction;
  sub(left: Fraction, right: Fraction): Fraction;
  mul(left: Fraction, right: Fraction): Fraction;
  div(left: Fraction, right: Fraction): Fraction;
  cmp(left: Fraction, right: Fraction): number;
  parse(value: string): Fraction;
  format(value: Fraction): string;
};

export = ({ decimal: { parseDecimal, divideDecimals, formatDecimal } }: {
  decimal: {
    parseDecimal(value: string): Decimal;
    divideDecimals(left: Decimal, right: Decimal, scale: number): Decimal;
    formatDecimal(value: Decimal): string;
  };
}): RationalOperations => {
  function gcd(a: bigint, b: bigint): bigint {
    while (b) [a, b] = [b, a % b];
    return a < 0n ? -a : a;
  }
  function fraction(n: bigint, d: bigint): Fraction {
    if (!d) throw new RangeError('Cannot divide by zero');
    if (!n) return { n: 0n, d: 1n };
    const divisor = gcd(n, d) * (d < 0n ? -1n : 1n);
    return { n: n / divisor, d: d / divisor };
  }
  const zero = fraction(0n, 1n);
  const one = fraction(1n, 1n);
  const neg = (a: Fraction): Fraction => ({ n: -a.n, d: a.d });
  const add = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a: Fraction, b: Fraction): Fraction => add(a, neg(b));
  const mul = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.n, a.d * b.d);
  const div = (a: Fraction, b: Fraction): Fraction => fraction(a.n * b.d, a.d * b.n);
  const cmp = (a: Fraction, b: Fraction): number => {
    const difference = a.n * b.d - b.n * a.d;
    return difference < 0n ? -1 : Number(difference > 0n);
  };
  function parse(value: string): Fraction {
    const decimal = parseDecimal(value);
    return fraction(decimal.coefficient, 10n ** BigInt(decimal.scale));
  }
  function format(value: Fraction): string {
    // Bounds may be repeating fractions. Keep those exact in diagnostics as well.
    let denominator = value.d;
    for (const factor of [2n, 5n]) while (denominator % factor === 0n) denominator /= factor;
    if (denominator !== 1n) return `${value.n}/${value.d}`;
    let scale = 0;
    let power = 1n;
    while (power % value.d) { power *= 10n; scale++; }
    return formatDecimal(divideDecimals(
      { coefficient: value.n, scale: 0 }, { coefficient: value.d, scale: 0 }, scale,
    ));
  }
  return { zero, one, fraction, neg, add, sub, mul, div, cmp, parse, format };
};
