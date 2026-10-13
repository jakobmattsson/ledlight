'use strict';

import type { LedgerAmount, LedgerComment, LedgerEntry } from '../../../../public-api';
import type { SqliteConstructor, SqliteDatabase, Statement } from './sqlite-contracts';

type Statements = Record<string, Statement>;
type Transaction = Extract<LedgerEntry, { type: 'transaction' }>;
type CommodityProperty = Extract<LedgerEntry, { type: 'commodity' }>['properties'][number];
type LocatedTag = { name: string; value: string | null; location: { line: number } };
type Counters = { posting: number; resolvedAmount: number; postingBalance: number; valuationPrice: number };
type Usage = { accounts: Set<string>; commodities: Set<string>; tags: Set<string> };
type Warning = { code: string; message: string; source: string; line: number; column: number; startLine: number; endLine: number };
type JournalInput = { journalPath: string; files: Array<{ path: string; sha256: string; size: number }>;
  entries: LedgerEntry[]; warnings?: Warning[] };
type Numeric = ReturnType<typeof import('../../../interfaces/numeric')>;
type Accounting = ReturnType<typeof import('../../../interfaces/accounting')>;
type DatabaseFacade = ReturnType<typeof import('../../../interfaces/database/index')>;
type SqlFunctions = ReturnType<typeof import('./decimal-sql-functions')>;
type BalanceMaterializer = ReturnType<typeof import('./posting-balance-materializer')>;
type PriceMaterializer = ReturnType<typeof import('./valuation-price-materializer')>;
type Migration = ReturnType<typeof import('./database-migration')>;
type Dependencies = {
  numeric: Pick<Numeric, 'decimal'>;
  accounting: Accounting;
  decimalSqlFunctions: SqlFunctions;
  postingBalanceMaterializer: BalanceMaterializer;
  valuationPriceMaterializer: PriceMaterializer;
  databaseMigration: Migration;
  external: { path: Pick<typeof import('node:path'), 'resolve'>; sqlite: SqliteConstructor };
};
type DatabaseSummary = ReturnType<DatabaseFacade['writeJournalDatabase']>;
type Result = { writeJournalDatabase(databasePath: string, journal: JournalInput): DatabaseSummary };

export = ({
  numeric: {
    decimal: { compareDecimals, parseDecimal },
  },
  accounting: {
    PostingResolver,
    validateGlobalAccounting,
    journalValidator: { validateJournal, validateResolvedCommodityTrades },
    valuationCommodityFromJournal,
    inferEffectivePostingCosts,
  },
  decimalSqlFunctions: { registerDecimalFunctions },
  postingBalanceMaterializer: { materializePostingBalances },
  valuationPriceMaterializer: { materializeValuationPrices },
  databaseMigration: { SCHEMA_VERSION, migrateDatabase },
  external: {
    path,
    sqlite: Database
  },
}: Dependencies): Result => {

  function amountFields(amount: LedgerAmount | null | undefined): { quantity: string | null; commodity: string | null } {
    return {
      quantity: amount ? amount.quantity : null,
      commodity: amount ? amount.commodity : null,
    };
  }

  function prepareStatements(database: SqliteDatabase): Statements {
    return {
      databaseMetadata: database.prepare('INSERT INTO database_metadata (key, value) VALUES (?, ?)'),
      sourceFile: database.prepare(`
      INSERT INTO source_files (id, path, sha256, size)
      VALUES (?, ?, ?, ?)
    `),
      fileComment: database.prepare(`
      INSERT INTO file_comments (entry_id, text)
      VALUES (?, ?)
    `),
      journalEntry: database.prepare(`
      INSERT INTO journal_entries (id, source_file_id, line)
      VALUES (?, ?, ?)
    `),
      transaction: database.prepare(`
      INSERT INTO transactions
        (entry_id, date, description)
      VALUES (?, ?, ?)
    `),
      posting: database.prepare(`
      INSERT INTO postings
        (id, transaction_id, position, posting_date, account,
         amount_quantity, amount_commodity,
         lot_cost_quantity, lot_cost_commodity, lot_cost_is_total,
         cost_quantity, cost_commodity, cost_is_total,
         balance_quantity, balance_commodity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
      comment: database.prepare(`
      INSERT INTO comments (transaction_id, posting_id, position, text)
      VALUES (?, ?, ?, ?)
    `),
      entryTag: database.prepare(`
      INSERT INTO tags (transaction_id, posting_id, position, ordinal, name, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      resolvedPostingAmount: database.prepare(`
      INSERT INTO resolved_posting_amounts (id, posting_id, position, amount_quantity, amount_commodity)
      VALUES (?, ?, ?, ?, ?)
    `),
      price: database.prepare(`
      INSERT INTO prices
        (entry_id, date, base_commodity, quote_quantity, quote_commodity, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      account: database.prepare(`
      INSERT INTO account_declarations (entry_id, name, comment, used) VALUES (?, ?, ?, ?)
    `),
      tag: database.prepare(`
      INSERT INTO tag_declarations (entry_id, name, comment, used) VALUES (?, ?, ?, ?)
    `),
      commodity: database.prepare(`
      INSERT INTO commodity_declarations (entry_id, symbol, comment, format, is_default, used)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    };
  }

  function insertComments(statement: Statement, comments: LedgerComment[], ownerLine: number, transactionId: number | null, postingId: number | null): void {
    for (const comment of comments) {
      const position = comment.location.line - ownerLine;
      statement.run(transactionId, postingId, position, comment.text);
    }
  }

  function insertTags(statement: Statement, tags: LocatedTag[], ownerLine: number, transactionId: number | null, postingId: number | null): void {
    let previousPosition = -1;
    let ordinal = 0;
    for (const tag of tags) {
      const position = tag.location.line - ownerLine;
      ordinal = position === previousPosition ? ordinal + 1 : 0;
      statement.run(transactionId, postingId, position, ordinal, tag.name, tag.value);
      previousPosition = position;
    }
  }

  function insertTransaction(statements: Statements, entryId: number, entry: Transaction, counters: Counters, resolvedPostings: LedgerAmount[][]): void {
    statements.transaction.run(
      entryId, entry.date, entry.description,
    );

    insertComments(statements.comment, entry.comments, entry.location.line, entryId, null);
    insertTags(statements.entryTag, (entry.tags || []) as LocatedTag[], entry.location.line, entryId, null);

    entry.postings.forEach((posting, position) => {
      const amount = amountFields(posting.amount);
      const lotCost = amountFields(posting.lotCost && posting.lotCost.amount);
      const cost = amountFields(posting.cost && posting.cost.amount);
      const balance = amountFields(posting.balanceAssignment || posting.balanceAssertion);
      const postingId = ++counters.posting;
      statements.posting.run(
        postingId, entryId, position, posting.postingDate || entry.date,
        posting.account, amount.quantity, amount.commodity,
        lotCost.quantity, lotCost.commodity, posting.lotCost ? Number(posting.lotCost.total) : null,
        cost.quantity, cost.commodity, posting.cost ? Number(posting.cost.total) : null,
        balance.quantity, balance.commodity,
      );
      insertComments(statements.comment, posting.comments, posting.location.line, null, postingId);
      insertTags(statements.entryTag, (posting.tags || []) as LocatedTag[], posting.location.line, null, postingId);
      resolvedPostings[position].forEach((resolvedAmount, amountPosition) => {
        statements.resolvedPostingAmount.run(
          ++counters.resolvedAmount, postingId, amountPosition,
          resolvedAmount.quantity, resolvedAmount.commodity,
        );
      });
    });

  }

  function insertEntry(
    statements: Statements, entryId: number, entry: LedgerEntry, counters: Counters,
    resolvedTransactions: Map<Transaction, LedgerAmount[][]>, ignoredProperties: Set<CommodityProperty>, usage: Usage,
  ): void {
    switch (entry.type) {
      case 'comment':
        statements.fileComment.run(entryId, entry.text);
        break;
      case 'transaction':
        insertTransaction(statements, entryId, entry, counters, resolvedTransactions.get(entry)!);
        break;
      case 'price':
        statements.price.run(
          entryId, entry.date, entry.commodity, entry.price.quantity,
          entry.price.commodity, entry.comment,
        );
        break;
      case 'account':
        statements.account.run(entryId, entry.name, entry.comment, Number(usage.accounts.has(entry.name)));
        break;
      case 'tag':
        statements.tag.run(entryId, entry.name, entry.comment, Number(usage.tags.has(entry.name)));
        break;
      case 'commodity': {
        const properties = entry.properties.filter((property) => !ignoredProperties.has(property));
        statements.commodity.run(
          entryId, entry.symbol, entry.comment,
          properties.slice().reverse().find((property) => property.name === 'format')?.value ?? null,
          Number(properties.some((property) => property.name === 'default')),
          Number(usage.commodities.has(entry.symbol)),
        );
        break;
      }
      default:
        throw new Error(`Cannot store unsupported journal entry type: ${(entry as LedgerEntry).type}`);
    }
  }

  function declarationUsage(entries: LedgerEntry[], resolvedTransactions: Map<Transaction, LedgerAmount[][]>): Usage {
    const usage: Usage = {
      accounts: new Set<string>(),
      commodities: new Set<string>(),
      tags: new Set<string>(),
    };
    for (const entry of entries) {
      if (entry.type !== 'transaction') continue;
      const resolvedPostings = resolvedTransactions.get(entry);
      if (!resolvedPostings) continue;
      let transactionUsed = false;
      entry.postings.forEach((posting, position) => {
        const postingUsed = resolvedPostings[position].some(({ quantity }) =>
          compareDecimals(parseDecimal(quantity), parseDecimal('0')) !== 0);
        if (!postingUsed) return;
        transactionUsed = true;
        usage.accounts.add(posting.account);
        for (const amount of [
          posting.amount,
          posting.lotCost?.amount,
          posting.cost?.amount,
          posting.balanceAssignment,
          posting.balanceAssertion,
          ...resolvedPostings[position],
        ]) {
          if (amount?.commodity) usage.commodities.add(amount.commodity);
        }
        for (const tag of posting.tags || []) usage.tags.add(tag.name);
      });
      if (transactionUsed) {
        for (const tag of entry.tags || []) usage.tags.add(tag.name);
      }
    }
    return usage;
  }

  function writeJournalDatabase(databasePath: string, journal: JournalInput): DatabaseSummary {
    const warnings = [...(journal.warnings || [])];
    const ignoredProperties = new Set<CommodityProperty>();
    const valuationCommodity = valuationCommodityFromJournal(
      journal, warnings, ignoredProperties,
    );
    const inferredWarnings: Warning[] = [];
    inferEffectivePostingCosts(journal.entries, valuationCommodity, inferredWarnings);
    const validation = validateJournal(journal, valuationCommodity, warnings);
    validation.warnings.push(...inferredWarnings);
    const postingResolver = new PostingResolver(validation.warnings);
    const resolvedTransactions = new Map<Transaction, LedgerAmount[][]>();
    for (const entry of journal.entries) {
      if (validation.invalidEntries.has(entry) || entry.type !== 'transaction') continue;
      const resolved = postingResolver.resolve(entry);
      if (resolved) {
        validateResolvedCommodityTrades(entry, resolved, valuationCommodity, validation.warnings);
        resolvedTransactions.set(entry, resolved);
      }
    }
    const storableEntries = journal.entries.filter((entry) =>
      !validation.invalidEntries.has(entry) &&
      (entry.type !== 'transaction' || resolvedTransactions.has(entry)));
    validateGlobalAccounting(
      storableEntries, resolvedTransactions, valuationCommodity, validation.warnings,
    );
    const usage = declarationUsage(storableEntries, resolvedTransactions);
    const resolvedDatabasePath = path.resolve(databasePath);
    const database = new Database(resolvedDatabasePath);
    database.pragma('foreign_keys = ON');
    registerDecimalFunctions(database);

    try {
      migrateDatabase(database);
      const statements = prepareStatements(database);
      const insertWarning = database.prepare(`
        INSERT INTO ingestion_warnings
          (position, code, message, source, line, column, start_line, end_line)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const replaceContents = database.transaction(() => {
        database.exec(`
        DELETE FROM valuation_prices;
        DELETE FROM ingestion_warnings;
        DELETE FROM journal_entries;
        DELETE FROM source_files;
        DELETE FROM database_metadata;
      `);

        statements.databaseMetadata.run('schema_version', SCHEMA_VERSION);
        statements.databaseMetadata.run('root_path', journal.journalPath);
        statements.databaseMetadata.run('built_at', new Date().toISOString());
        if (valuationCommodity) {
          statements.databaseMetadata.run('valuation_commodity', valuationCommodity);
        }

        const sourceIds = new Map<string, number>();
        journal.files.forEach((file, index) => {
          const fileId = index + 1;
          statements.sourceFile.run(fileId, file.path, file.sha256, file.size);
          sourceIds.set(file.path, fileId);
        });

        const counters: Counters = {
          posting: 0,
          resolvedAmount: 0,
          postingBalance: 0,
          valuationPrice: 0,
        };
        storableEntries.forEach((entry, index) => {
          const sourceFileId = sourceIds.get(entry.location.source);
          if (sourceFileId === undefined) {
            throw new Error(`Journal entry refers to an unregistered source file: ${entry.location.source}`);
          }
          const entryId = index + 1;
          statements.journalEntry.run(
            entryId, sourceFileId, entry.location.line,
          );
          insertEntry(
            statements, entryId, entry, counters, resolvedTransactions, ignoredProperties, usage,
          );
        });

        validation.warnings.forEach((warning: Warning, position: number) => {
          insertWarning.run(
            position, warning.code, warning.message, warning.source, warning.line, warning.column,
            warning.startLine, warning.endLine,
          );
        });

        counters.postingBalance = materializePostingBalances(database);
        counters.valuationPrice = materializeValuationPrices(database, valuationCommodity);

        return counters;
      });

      const counters = replaceContents.immediate();
      return {
        databasePath: resolvedDatabasePath,
        journalPath: journal.journalPath,
        files: journal.files.length,
        entries: storableEntries.length,
        transactions: storableEntries.filter((entry) => entry.type === 'transaction').length,
        postings: counters.posting,
        postingAmounts: counters.resolvedAmount,
        postingBalances: counters.postingBalance,
        prices: storableEntries.filter((entry) => entry.type === 'price').length,
        valuationCommodity,
        valuationPrices: counters.valuationPrice,
        warnings: validation.warnings,
      };
    } finally {
      database.close();
    }
  }

  return { writeJournalDatabase };
};
