'use strict';

// Queries may read these tables and columns from the derived SQLite database.
export = () => {
  const columns = {
    database_metadata: ['key', 'value'],
    source_files: ['id', 'path', 'sha256', 'size'],
    journal_entries: ['id', 'source_file_id', 'line'],
    file_comments: ['entry_id', 'text'],
    prices: ['entry_id', 'date', 'base_commodity', 'quote_quantity', 'quote_commodity', 'comment'],
    account_declarations: ['entry_id', 'name', 'comment', 'used'],
    tag_declarations: ['entry_id', 'name', 'comment', 'used'],
    commodity_declarations: ['entry_id', 'symbol', 'comment', 'format', 'is_default', 'used'],
    transactions: ['entry_id', 'date', 'description'],
    postings: ['id', 'transaction_id', 'position', 'posting_date', 'account',
      'amount_quantity', 'amount_commodity', 'lot_cost_quantity', 'lot_cost_commodity',
      'lot_cost_is_total', 'cost_quantity', 'cost_commodity', 'cost_is_total',
      'balance_quantity', 'balance_commodity'],
    comments: ['id', 'transaction_id', 'posting_id', 'position', 'text'],
    tags: ['id', 'transaction_id', 'posting_id', 'position', 'ordinal', 'name', 'value'],
    resolved_posting_amounts: ['id', 'posting_id', 'position', 'amount_quantity',
      'amount_commodity', 'balance_quantity'],
    valuation_prices: ['commodity', 'date', 'rate'],
  };
  return Object.freeze(Object.fromEntries(Object.entries(columns).map(([table, names]) => [
    table, Object.freeze(names),
  ])));
};
