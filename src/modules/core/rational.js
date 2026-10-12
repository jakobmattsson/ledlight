'use strict';

module.exports = ({ decimal: { parseDecimal, divideDecimals, formatDecimal } }) => {
  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a < 0n ? -a : a;
  }
  function fraction(n, d) {
    if (!d) throw new RangeError('Cannot divide by zero');
    if (!n) return { n: 0n, d: 1n };
    const divisor = gcd(n, d) * (d < 0n ? -1n : 1n);
    return { n: n / divisor, d: d / divisor };
  }
  const zero = fraction(0n, 1n);
  const one = fraction(1n, 1n);
  const neg = (a) => ({ n: -a.n, d: a.d });
  const add = (a, b) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => add(a, neg(b));
  const mul = (a, b) => fraction(a.n * b.n, a.d * b.d);
  const div = (a, b) => fraction(a.n * b.d, a.d * b.n);
  const cmp = (a, b) => {
    const difference = a.n * b.d - b.n * a.d;
    return difference < 0n ? -1 : Number(difference > 0n);
  };
  function parse(value) {
    const decimal = parseDecimal(value);
    return fraction(decimal.coefficient, 10n ** BigInt(decimal.scale));
  }
  function format(value) {
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
