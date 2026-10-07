-- Database and source-file metadata.
CREATE TABLE IF NOT EXISTS database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS source_files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  size INTEGER NOT NULL CHECK (size >= 0)
);

-- Parsed journal data. Some fields are normalized during ingestion.
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY,
  source_file_id INTEGER NOT NULL REFERENCES source_files(id),
  line INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS postings (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(entry_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  posting_date TEXT NOT NULL,
  line INTEGER NOT NULL,
  account TEXT NOT NULL,
  amount_quantity TEXT,
  amount_commodity TEXT,
  lot_cost_quantity TEXT,
  lot_cost_commodity TEXT,
  lot_cost_is_total INTEGER CHECK (lot_cost_is_total IN (0, 1)),
  cost_quantity TEXT,
  cost_commodity TEXT,
  cost_is_total INTEGER CHECK (cost_is_total IN (0, 1)),
  balance_assignment_quantity TEXT,
  balance_assignment_commodity TEXT,
  balance_assertion_quantity TEXT,
  balance_assertion_commodity TEXT,
  CHECK ((amount_quantity IS NULL) = (amount_commodity IS NULL)),
  CHECK (
    (lot_cost_quantity IS NULL AND lot_cost_commodity IS NULL AND lot_cost_is_total IS NULL) OR
    (lot_cost_quantity IS NOT NULL AND lot_cost_commodity IS NOT NULL AND lot_cost_is_total IS NOT NULL)
  ),
  CHECK (
    (cost_quantity IS NULL AND cost_commodity IS NULL AND cost_is_total IS NULL) OR
    (cost_quantity IS NOT NULL AND cost_commodity IS NOT NULL AND cost_is_total IS NOT NULL)
  ),
  CHECK ((balance_assignment_quantity IS NULL) = (balance_assignment_commodity IS NULL)),
  CHECK ((balance_assertion_quantity IS NULL) = (balance_assertion_commodity IS NULL)),
  CHECK (amount_quantity IS NULL OR balance_assignment_quantity IS NULL),
  UNIQUE (transaction_id, position)
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(entry_id) ON DELETE CASCADE,
  posting_id INTEGER REFERENCES postings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  CHECK ((transaction_id IS NULL) != (posting_id IS NULL)),
  UNIQUE (transaction_id, position),
  UNIQUE (posting_id, position)
);

CREATE TABLE IF NOT EXISTS prices (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  base_commodity TEXT NOT NULL,
  quote_quantity TEXT NOT NULL,
  quote_commodity TEXT NOT NULL,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS account_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  comment TEXT,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tag_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  comment TEXT,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

CREATE TABLE IF NOT EXISTS commodity_declarations (
  entry_id INTEGER PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL UNIQUE,
  comment TEXT,
  format TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

-- Derived data from parsing, validation, and valuation.
CREATE TABLE IF NOT EXISTS ingestion_warnings (
  position INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  line INTEGER NOT NULL,
  column INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resolved_posting_amounts (
  id INTEGER PRIMARY KEY,
  posting_id INTEGER NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  quantity TEXT NOT NULL,
  commodity TEXT NOT NULL,
  running_balance TEXT NOT NULL DEFAULT '0',
  UNIQUE (posting_id, position)
);

CREATE TABLE IF NOT EXISTS valuation_prices (
  commodity TEXT NOT NULL,
  date TEXT NOT NULL,
  rate TEXT NOT NULL,
  PRIMARY KEY (commodity, date)
) WITHOUT ROWID;

-- Indexes.
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS postings_account_posting_date ON postings(account, posting_date);
CREATE INDEX IF NOT EXISTS postings_posting_date ON postings(posting_date);
CREATE INDEX IF NOT EXISTS prices_base_commodity_date ON prices(base_commodity, date);
CREATE INDEX IF NOT EXISTS resolved_posting_amounts_commodity ON resolved_posting_amounts(commodity);
