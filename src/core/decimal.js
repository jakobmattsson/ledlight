'use strict';

module.exports = () => {

  const POWERS_OF_TEN = [1n];

  function powerOfTen(exponent) {
    while (POWERS_OF_TEN.length <= exponent) {
      POWERS_OF_TEN.push(POWERS_OF_TEN.at(-1) * 10n);
    }
    return POWERS_OF_TEN[exponent];
  }

  function parseDecimal(value) {
    if (typeof value !== 'string') throw new TypeError('Decimal value must be a string');
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(value);
    if (!match) throw new Error(`Invalid decimal value: ${JSON.stringify(value)}`);
    const integer = match[2];
    const fraction = match[3] || '';
    const sign = match[1] === '-' ? -1n : 1n;
    return normalizeDecimal({ coefficient: sign * BigInt(integer + fraction), scale: fraction.length });
  }

  function normalizeDecimal(decimal) {
    let { coefficient, scale } = decimal;
    if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
    while (scale > 0 && coefficient % 10n === 0n) {
      coefficient /= 10n;
      scale--;
    }
    return { coefficient, scale };
  }

  function alignDecimals(left, right) {
    const scale = Math.max(left.scale, right.scale);
    return {
      left: left.coefficient * powerOfTen(scale - left.scale),
      right: right.coefficient * powerOfTen(scale - right.scale),
      scale,
    };
  }

  function addDecimals(left, right) {
    const aligned = alignDecimals(left, right);
    return normalizeDecimal({ coefficient: aligned.left + aligned.right, scale: aligned.scale });
  }

  function subtractDecimals(left, right) {
    return addDecimals(left, { coefficient: -right.coefficient, scale: right.scale });
  }

  function multiplyDecimals(left, right) {
    return normalizeDecimal({
      coefficient: left.coefficient * right.coefficient,
      scale: left.scale + right.scale,
    });
  }

  function divideDecimals(left, right, scale) {
    if (right.coefficient === 0n) throw new RangeError('Cannot divide by zero');
    if (!Number.isInteger(scale) || scale < 0) {
      throw new RangeError('Decimal scale must be a non-negative integer');
    }
    const exponent = scale + right.scale - left.scale;
    const numerator = left.coefficient * powerOfTen(Math.max(exponent, 0));
    const denominator = right.coefficient * powerOfTen(Math.max(-exponent, 0));
    const negative = (numerator < 0n) !== (denominator < 0n);
    const absoluteNumerator = numerator < 0n ? -numerator : numerator;
    const absoluteDenominator = denominator < 0n ? -denominator : denominator;
    let coefficient = absoluteNumerator / absoluteDenominator;
    if ((absoluteNumerator % absoluteDenominator) * 2n >= absoluteDenominator) coefficient += 1n;
    return normalizeDecimal({ coefficient: negative ? -coefficient : coefficient, scale });
  }

  function negateDecimal(decimal) {
    return { coefficient: -decimal.coefficient, scale: decimal.scale };
  }

  function formatDecimal(decimal) {
    const normalized = normalizeDecimal(decimal);
    const negative = normalized.coefficient < 0n;
    let digits = (negative ? -normalized.coefficient : normalized.coefficient).toString();
    if (normalized.scale > 0) {
      digits = digits.padStart(normalized.scale + 1, '0');
      digits = `${digits.slice(0, -normalized.scale)}.${digits.slice(-normalized.scale)}`;
    }
    return negative ? `-${digits}` : digits;
  }

  function formatDecimalFixed(decimal, scale) {
    if (!Number.isInteger(scale) || scale < 0) throw new RangeError('Decimal scale must be a non-negative integer');
    let coefficient = decimal.coefficient;
    if (decimal.scale < scale) {
      coefficient *= powerOfTen(scale - decimal.scale);
    } else if (decimal.scale > scale) {
      const divisor = powerOfTen(decimal.scale - scale);
      const negative = coefficient < 0n;
      const absolute = negative ? -coefficient : coefficient;
      let rounded = absolute / divisor;
      if ((absolute % divisor) * 2n >= divisor) rounded += 1n;
      coefficient = negative ? -rounded : rounded;
    }

    const negative = coefficient < 0n;
    let digits = (negative ? -coefficient : coefficient).toString();
    if (scale > 0) {
      digits = digits.padStart(scale + 1, '0');
      digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    }
    return negative && coefficient !== 0n ? `-${digits}` : digits;
  }

  function compareDecimals(left, right) {
    const aligned = alignDecimals(left, right);
    return aligned.left < aligned.right ? -1 : Number(aligned.left > aligned.right);
  }

  function registerDecimalFunctions(database) {
    database.aggregate('decimal_sum', {
      start: () => ({ coefficient: 0n, scale: 0 }),
      step: (total, value) => value === null
        ? total
        : addDecimals(total, parseDecimal(value)),
      result: formatDecimal,
    });
    database.function('decimal_mul', { deterministic: true }, (left, right) => {
      if (left === null || right === null) return null;
      return formatDecimal(multiplyDecimals(parseDecimal(left), parseDecimal(right)));
    });
    database.function('decimal_add', { deterministic: true }, (left, right) => {
      if (left === null || right === null) return null;
      return formatDecimal(addDecimals(parseDecimal(left), parseDecimal(right)));
    });
    database.function('decimal_cmp', { deterministic: true }, (left, right) => {
      if (left === null || right === null) return null;
      return compareDecimals(parseDecimal(left), parseDecimal(right));
    });
  }

  return {
    addDecimals,
    compareDecimals,
    divideDecimals,
    formatDecimal,
    formatDecimalFixed,
    multiplyDecimals,
    negateDecimal,
    parseDecimal,
    registerDecimalFunctions,
    subtractDecimals,
  };
};
