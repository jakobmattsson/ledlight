CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS source_files (
  id INTEGER PRIMARY KEY,
  traversal_index INTEGER NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  size INTEGER NOT NULL CHECK (size >= 0)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY,
  sequence INTEGER NOT NULL UNIQUE,
  source_file_id INTEGER NOT NULL REFERENCES source_files(id),
  type TEXT NOT NULL CHECK (type IN ('account', 'tag', 'commodity', 'price', 'transaction')),
  line INTEGER NOT NULL,
  column INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT,
  code TEXT,
  description TEXT NOT NULL,
  payee TEXT,
  narration TEXT NOT NULL,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS postings (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(entry_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  report_date TEXT NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  account TEXT NOT NULL,
  amount_quantity TEXT,
  amount_commodity TEXT,
  cost_quantity TEXT,
  cost_commodity TEXT,
  cost_is_total INTEGER CHECK (cost_is_total IN (0, 1)),
  balance_assignment_quantity TEXT,
  balance_assignment_commodity TEXT,
  balance_assertion_quantity TEXT,
  balance_assertion_commodity TEXT,
  comment TEXT,
  UNIQUE (transaction_id, position)
);

CREATE TABLE IF NOT EXISTS transaction_notes (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(entry_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  text TEXT NOT NULL,
  key TEXT,
  value TEXT,
  UNIQUE (transaction_id, position)
);

CREATE TABLE IF NOT EXISTS resolved_posting_amounts (
  id INTEGER PRIMARY KEY,
  posting_id INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  commodity TEXT NOT NULL,
  UNIQUE (posting_id, position)
);

CREATE TABLE IF NOT EXISTS prices (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  commodity TEXT NOT NULL,
  price_quantity TEXT NOT NULL,
  price_commodity TEXT,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS valuation_prices (
  commodity TEXT NOT NULL,
  date TEXT NOT NULL,
  rate TEXT NOT NULL,
  PRIMARY KEY (commodity, date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS account_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS tag_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS commodity_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS commodity_properties (
  id INTEGER PRIMARY KEY,
  commodity_id INTEGER NOT NULL REFERENCES commodity_declarations(entry_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  name TEXT NOT NULL,
  value TEXT,
  comment TEXT,
  UNIQUE (commodity_id, position)
);

CREATE INDEX IF NOT EXISTS journal_entries_source_location
  ON journal_entries(source_file_id, line);
CREATE INDEX IF NOT EXISTS transactions_date
  ON transactions(date);
CREATE INDEX IF NOT EXISTS postings_account
  ON postings(account);
CREATE INDEX IF NOT EXISTS resolved_posting_amounts_commodity
  ON resolved_posting_amounts(commodity);
CREATE INDEX IF NOT EXISTS prices_commodity_date
  ON prices(commodity, date);
