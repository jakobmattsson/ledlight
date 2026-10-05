'use strict';

module.exports = ({
  rational: { zero, one, add, sub, mul, div, neg, cmp },
  linearProgram: { maximize },
}) => {
  const expression = (constant, coefficients) => ({ constant, coefficients: coefficients || new Map() });
  function scale(value, factor) {
    return expression(mul(value.constant, factor), new Map(
      [...value.coefficients].map(([key, coefficient]) => [key, mul(coefficient, factor)]),
    ));
  }
  function subtractVariable(value, variable) {
    const coefficients = new Map(value.coefficients);
    coefficients.set(variable, sub(coefficients.get(variable) || zero, one));
    return expression(value.constant, coefficients);
  }

  class AllocationHistory {
    constructor() {
      this.groups = new Map();
      this.constraints = [];
      this.variables = 0;
      this.totals = new Map();
      this.invalid = false;
    }
    merge(other) {
      if (other === this) return;
      const offset = this.variables;
      const remap = (coefficients) => new Map([...coefficients]
        .map(([key, value]) => [key + offset, value]));
      this.constraints.push(...other.constraints.map(({ coefficients, bound }) => ({
        coefficients: remap(coefficients), bound,
      })));
      for (const [account, groups] of other.groups) {
        this.holdings(account).push(...groups.map(({ price, remaining }) => ({
          price, remaining: expression(remaining.constant, remap(remaining.coefficients)),
        })));
      }
      for (const [account, total] of other.totals) this.changeTotal(account, total.quantity, total.cost);
      this.variables += other.variables;
      this.invalid ||= other.invalid;
    }
    holdings(account) {
      if (!this.groups.has(account)) this.groups.set(account, []);
      return this.groups.get(account);
    }
    total(account) {
      return this.totals.get(account) || { quantity: zero, cost: zero };
    }
    changeTotal(account, quantity, cost) {
      const previous = this.total(account);
      this.totals.set(account, {
        quantity: add(previous.quantity, quantity), cost: add(previous.cost, cost),
      });
    }
    acquire(account, quantity, cost) {
      this.changeTotal(account, quantity, cost);
      const price = div(cost, quantity);
      const group = this.holdings(account).find((candidate) =>
        !candidate.remaining.coefficients.size && cmp(candidate.price, price) === 0);
      if (group) group.remaining.constant = add(group.remaining.constant, quantity);
      else this.holdings(account).push({ price, remaining: expression(quantity) });
    }
    equality(coefficients, bound) {
      this.constraints.push({ coefficients, bound });
      this.constraints.push({
        coefficients: new Map([...coefficients].map(([key, value]) => [key, neg(value)])),
        bound: neg(bound),
      });
    }
    dispose(account, quantity, cost, destination, destinationQuantity) {
      if (this.invalid) return null;
      const groups = this.holdings(account);
      const total = this.total(account);
      if (cmp(quantity, total.quantity) === 0) {
        if (cmp(cost, total.cost) !== 0) {
          this.invalid = true;
          return { minimum: total.cost, maximum: total.cost };
        }
        this.groups.set(account, []);
        if (destination) {
          const ratio = div(destinationQuantity, quantity);
          this.holdings(destination).push(...groups.map((group) => ({
            price: div(group.price, ratio), remaining: scale(group.remaining, ratio),
          })));
        }
        this.changeTotal(account, neg(quantity), neg(cost));
        if (destination) this.changeTotal(destination, destinationQuantity, cost);
        return null;
      }
      // Exact greedy bounds are sufficient before any ambiguous allocation.
      // At an endpoint the remaining amounts at each distinct price are fixed.
      if (groups.every((group) => group.remaining.coefficients.size === 0)) {
        const consume = (descending) => {
          let needed = quantity;
          let value = zero;
          const taken = new Map();
          const ordered = [...groups].sort((a, b) => cmp(a.price, b.price) * descending);
          for (const group of ordered) {
            const amount = cmp(needed, group.remaining.constant) < 0 ? needed : group.remaining.constant;
            taken.set(group, amount);
            needed = sub(needed, amount);
            value = add(value, mul(amount, group.price));
          }
          return { needed, value, taken };
        };
        const lower = consume(1);
        const upper = consume(-1);
        if (lower.needed.n > 0n) { this.invalid = true; return { insufficient: true }; }
        if (cmp(cost, lower.value) < 0 || cmp(cost, upper.value) > 0) {
          this.invalid = true;
          return { minimum: lower.value, maximum: upper.value };
        }
        const endpoint = cmp(cost, lower.value) === 0 ? lower : (cmp(cost, upper.value) === 0 ? upper : null);
        if (endpoint) {
          const moved = [];
          for (const [group, amount] of endpoint.taken) {
            group.remaining.constant = sub(group.remaining.constant, amount);
            if (destination && amount.n) {
              const ratio = div(destinationQuantity, quantity);
              moved.push({ price: div(group.price, ratio), remaining: expression(mul(amount, ratio)) });
            }
          }
          this.groups.set(account, groups.filter((group) => group.remaining.constant.n));
          if (destination) this.holdings(destination).push(...moved);
          this.changeTotal(account, neg(quantity), neg(cost));
          if (destination) this.changeTotal(destination, destinationQuantity, cost);
          return null;
        }
      }
      const amountCoefficients = new Map();
      const costCoefficients = new Map();
      const allocated = [];
      for (const group of groups) {
        const variable = this.variables++;
        const coefficients = new Map([...group.remaining.coefficients]
          .map(([key, value]) => [key, neg(value)]));
        coefficients.set(variable, one);
        this.constraints.push({ coefficients, bound: group.remaining.constant });
        amountCoefficients.set(variable, one);
        costCoefficients.set(variable, group.price);
        allocated.push({ group, variable });
      }
      this.equality(amountCoefficients, quantity);
      const upper = maximize(this.variables, this.constraints, costCoefficients);
      const lower = maximize(this.variables, this.constraints,
        new Map([...costCoefficients].map(([key, value]) => [key, neg(value)])));
      if (upper.status !== 'optimal' || lower.status !== 'optimal') {
        this.invalid = true;
        return { insufficient: true };
      }
      const minimum = neg(lower.value);
      const maximum = upper.value;
      if (cmp(cost, minimum) < 0 || cmp(cost, maximum) > 0) {
        this.invalid = true;
        return { minimum, maximum };
      }
      this.equality(costCoefficients, cost);
      const transferred = [];
      for (const { group, variable } of allocated) {
        group.remaining = subtractVariable(group.remaining, variable);
        if (destination) {
          const ratio = div(destinationQuantity, quantity);
          transferred.push({
            price: div(group.price, ratio),
            remaining: scale(expression(zero, new Map([[variable, one]])), ratio),
          });
        }
      }
      if (destination) this.holdings(destination).push(...transferred);
      this.changeTotal(account, neg(quantity), neg(cost));
      if (destination) this.changeTotal(destination, destinationQuantity, cost);
      return null;
    }
  }
  return { AllocationHistory };
};
