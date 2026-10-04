'use strict';

const entry = (id, ledlightCommand, ledgerCommand) =>
  Object.freeze([id, ledlightCommand, ledgerCommand]);

module.exports = Object.freeze([
  entry(
    'accounts',
    'ledlight accounts --file <journal>',
    'ledger --args-only --no-pager --file <journal> accounts',
  ),
  entry(
    'tags',
    'ledlight tags --file <journal>',
    'ledger --args-only --no-pager --file <journal> tags',
  ),
  entry(
    'commodities',
    'ledlight commodities --file <journal>',
    'ledger --args-only --no-pager --file <journal> commodities',
  ),
  entry(
    'prices',
    'ledlight prices --file <journal>',
    'ledger --args-only --no-pager --file <journal> prices',
  ),
  entry(
    'transactions',
    'ledlight transactions --file <journal>',
    'ledger --args-only --no-pager --file <journal> print',
  ),
  entry('balance', 'ledlight balance --file <journal>', null),
  entry('unrealized-gains', 'ledlight unrealized-gains --file <journal>', null),
  entry('balance-history', 'ledlight balance-history --file <journal>', null),
  entry('investment-performance', 'ledlight investment-performance --file <journal>', null),
  entry('account-postings', 'ledlight account-postings ... --file <journal>', null),
  entry('account-transactions', 'ledlight account-transactions ... --file <journal>', null),
  entry('reconciliation-entries', 'ledlight reconciliation-entries ... --file <journal>', null),
]);
