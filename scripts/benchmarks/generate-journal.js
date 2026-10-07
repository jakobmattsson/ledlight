'use strict';

const fs = require('node:fs');

const COMMODITY_COUNT = 44;
const ACCOUNT_COUNT = 210;
const TRANSACTION_COUNT = 4500;
const PRICE_COUNT = 31000;
const TRADE_COUNT = 800;
const CONCENTRATED_TRADE_COUNT = 32;
const SALE_COUNT = 250;
const CLEARING_ACCOUNT_COUNT = 55;
const START = Date.UTC(2014, 0, 1);
const DAYS = Math.round((Date.UTC(2020, 0, 1) - START) / 86400000);

function dateAt(index, count) {
  const day = Math.floor(index * (DAYS - 1) / (count - 1));
  return new Date(START + day * 86400000).toISOString().slice(0, 10);
}

function instrument(index) {
  return `UNIT${String(index + 1).padStart(3, '0')}`;
}

function category(index) {
  return `Expenses:Category${String(index + 1).padStart(3, '0')}`;
}

function clearing(index) {
  return `Assets:Clearing${String(index + 1).padStart(3, '0')}`;
}

function eventSlots(count) {
  return Array.from({ length: count }, (_, index) =>
    Math.floor((index + 0.5) * TRANSACTION_COUNT / count));
}

function generateJournal(fileName) {
  const lines = [
    '; Entirely synthetic performance fixture.',
    'commodity BASE',
    '  default',
    '  format 1,000.00 BASE',
  ];
  for (let index = 0; index < COMMODITY_COUNT; index += 1) {
    lines.push(`commodity ${instrument(index)}`, `  format 1,000 ${instrument(index)}`);
  }
  for (let index = 0; index < 7; index += 1) lines.push(`tag Tag${index + 1}`);
  lines.push('account Assets:Cash', 'account Equity:Opening',
    'account Income:Routine', 'account Income:Trading');
  for (let index = 0; index < COMMODITY_COUNT; index += 1) {
    lines.push(`account Assets:Holding:${instrument(index)}`);
  }
  for (let index = 0; index < 107; index += 1) lines.push(`account ${category(index)}`);
  for (let index = 0; index < CLEARING_ACCOUNT_COUNT; index += 1) {
    lines.push(`account ${clearing(index)}`);
  }

  let generatedPrices = 0;
  for (let commodity = 0; commodity < COMMODITY_COUNT; commodity += 1) {
    const count = commodity < 3 ? 1026 : commodity < 30 ? 1000 : commodity < 33 ? 300 : 2;
    for (let index = 0; index < count; index += 1) {
      const price = 95 + ((commodity * 7 + index * 3) % 30);
      lines.push(`P ${dateAt(index, count)} ${instrument(commodity)} ${price} BASE`);
      generatedPrices += 1;
    }
  }

  const tradeSlots = new Set(eventSlots(TRADE_COUNT));
  const commentSlots = new Set(eventSlots(580));
  const clearingSlots = new Set();
  for (const initialSlot of eventSlots(CLEARING_ACCOUNT_COUNT * 2)) {
    let slot = initialSlot;
    while (tradeSlots.has(slot) || clearingSlots.has(slot)) slot += 1;
    clearingSlots.add(slot);
  }
  let tradeIndex = 0;
  let clearingIndex = 0;
  let routineIndex = 0;
  let splitCount = 0;
  let sales = 0;
  for (let index = 0; index < TRANSACTION_COUNT; index += 1) {
    const date = dateAt(index, TRANSACTION_COUNT);
    if (commentSlots.has(index)) lines.push(`; Synthetic section ${index + 1}`);
    lines.push('', `${date} Synthetic activity ${index + 1}`);
    if (index < 3650) lines.push(`  ; Tag${index % 7 + 1}: Group${index % 13 + 1}`);
    if (tradeSlots.has(index)) {
      const concentrated = tradeIndex >= TRADE_COUNT - CONCENTRATED_TRADE_COUNT;
      const unit = instrument(concentrated ? 0 : tradeIndex % COMMODITY_COUNT);
      const account = `Assets:Holding:${unit}`;
      // Repeated partial sales of one instrument accumulate cost-basis constraints.
      const tradeCycle = concentrated
        ? (tradeIndex - (TRADE_COUNT - CONCENTRATED_TRADE_COUNT)) % 3
        : Math.floor(tradeIndex / COMMODITY_COUNT) % 3;
      const sale = tradeCycle === 2 && sales < SALE_COUNT;
      if (sale) {
        lines.push(`  ${account}  -1 ${unit} {105 BASE} @ 110 BASE`,
          '  Assets:Cash  110 BASE', '  Income:Trading  -5 BASE');
        sales += 1;
      } else {
        const cost = 100 + 10 * tradeCycle;
        lines.push(`  ${account}  1 ${unit} {${cost} BASE}`, `  Assets:Cash  -${cost} BASE`);
      }
      tradeIndex += 1;
    } else if (clearingSlots.has(index)) {
      const account = clearing(Math.floor(clearingIndex / 2));
      const sign = clearingIndex % 2 === 0 ? 1 : -1;
      lines.push(`  ${account}  ${sign * 25} BASE`, `  Assets:Cash  ${-sign * 25} BASE`);
      clearingIndex += 1;
    } else if (routineIndex === 0) {
      lines.push('  Assets:Cash  1000000 BASE', '  Equity:Opening  -1000000 BASE');
      routineIndex += 1;
    } else if (routineIndex % 10 === 0) {
      lines.push('  Assets:Cash  250 BASE', '  Income:Routine  -250 BASE');
      routineIndex += 1;
    } else {
      const first = category(routineIndex % 107);
      const amount = 10 + routineIndex % 40;
      if (splitCount < 1150) {
        const second = category((routineIndex + 17) % 107);
        lines.push(`  ${first}  ${amount} BASE`, `  ${second}  5 BASE`,
          `  Assets:Cash  -${amount + 5} BASE`);
        splitCount += 1;
      } else {
        lines.push(`  ${first}  ${amount} BASE`, `  Assets:Cash  -${amount} BASE`);
      }
      routineIndex += 1;
    }
  }
  if (generatedPrices !== PRICE_COUNT || tradeIndex !== TRADE_COUNT || sales !== SALE_COUNT ||
      clearingIndex !== CLEARING_ACCOUNT_COUNT * 2 || routineIndex !== 3590 ||
      splitCount !== 1150 || ACCOUNT_COUNT !== 4 + COMMODITY_COUNT + 107 + CLEARING_ACCOUNT_COUNT) {
    throw new Error('Synthetic journal generation did not meet its target counts');
  }
  fs.writeFileSync(fileName, `${lines.join('\n')}\n`);
}

module.exports = { generateJournal, ACCOUNT_COUNT, TRANSACTION_COUNT, PRICE_COUNT, TRADE_COUNT };
