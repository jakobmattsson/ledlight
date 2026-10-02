'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: { registerDecimalFunctions },
  postingResolver: { PostingResolver },
  journalValidator: { validateJournal },
  sekPriceMaterializer: { materializeSekPrices },
  databaseMigration: { SCHEMA_VERSION, migrateDatabase },
}) => {

  function amountFields(amount) {
    return {
      quantity: amount ? amount.quantity : null,
      commodity: amount ? amount.commodity : null,
    };
  }

  function prepareStatements(database) {
    return {
      metadata: database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)'),
      sourceFile: database.prepare(`
      INSERT INTO source_files (id, traversal_index, path, sha256, size)
      VALUES (?, ?, ?, ?, ?)
    `),
      journalEntry: database.prepare(`
      INSERT INTO journal_entries (id, sequence, source_file_id, type, line, column)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      transaction: database.prepare(`
      INSERT INTO transactions
        (entry_id, date, status, code, description, payee, narration, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
      posting: database.prepare(`
      INSERT INTO postings
        (id, transaction_id, position, report_date, line, column, account,
         amount_quantity, amount_commodity, cost_quantity, cost_commodity, cost_is_total,
         balance_assignment_quantity, balance_assignment_commodity,
         balance_assertion_quantity, balance_assertion_commodity, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
      note: database.prepare(`
      INSERT INTO transaction_notes
        (id, transaction_id, position, line, column, text, key, value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
      resolvedPostingAmount: database.prepare(`
      INSERT INTO resolved_posting_amounts (id, posting_id, position, quantity, commodity)
      VALUES (?, ?, ?, ?, ?)
    `),
      price: database.prepare(`
      INSERT INTO prices
        (entry_id, date, commodity, price_quantity, price_commodity, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      account: database.prepare(`
      INSERT INTO account_declarations (entry_id, name, comment) VALUES (?, ?, ?)
    `),
      tag: database.prepare(`
      INSERT INTO tag_declarations (entry_id, name, comment) VALUES (?, ?, ?)
    `),
      commodity: database.prepare(`
      INSERT INTO commodity_declarations (entry_id, symbol, comment) VALUES (?, ?, ?)
    `),
      commodityProperty: database.prepare(`
      INSERT INTO commodity_properties
        (id, commodity_id, position, line, column, name, value, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    };
  }

  function insertTransaction(statements, entryId, entry, counters, postingResolver) {
    const resolvedPostings = postingResolver.resolve(entry);
    statements.transaction.run(
      entryId, entry.date, entry.status, entry.code,
      entry.description, entry.payee, entry.narration, entry.comment,
    );

    entry.postings.forEach((posting, position) => {
      const amount = amountFields(posting.amount);
      const cost = amountFields(posting.cost && posting.cost.amount);
      const assignment = amountFields(posting.balanceAssignment);
      const assertion = amountFields(posting.balanceAssertion);
      const postingId = ++counters.posting;
      statements.posting.run(
        postingId, entryId, position, posting.postingDate || entry.date,
        posting.location.line, posting.location.column,
        posting.account, amount.quantity, amount.commodity, cost.quantity, cost.commodity,
        posting.cost ? Number(posting.cost.total) : null,
        assignment.quantity, assignment.commodity, assertion.quantity, assertion.commodity,
        posting.comment,
      );
      resolvedPostings[position].forEach((resolvedAmount, amountPosition) => {
        statements.resolvedPostingAmount.run(
          ++counters.resolvedAmount, postingId, amountPosition,
          resolvedAmount.quantity, resolvedAmount.commodity,
        );
      });
    });

    entry.notes.forEach((note, position) => {
      statements.note.run(
        ++counters.note, entryId, position, note.location.line, note.location.column,
        note.text, note.key, note.value,
      );
    });
  }

  function insertEntry(statements, entryId, entry, counters, postingResolver) {
    switch (entry.type) {
      case 'transaction':
        insertTransaction(statements, entryId, entry, counters, postingResolver);
        break;
      case 'price':
        statements.price.run(
          entryId, entry.date, entry.commodity, entry.price.quantity,
          entry.price.commodity, entry.comment,
        );
        break;
      case 'account':
        statements.account.run(entryId, entry.name, entry.comment);
        break;
      case 'tag':
        statements.tag.run(entryId, entry.name, entry.comment);
        break;
      case 'commodity':
        statements.commodity.run(entryId, entry.symbol, entry.comment);
        entry.properties.forEach((property, position) => {
          statements.commodityProperty.run(
            ++counters.property, entryId, position, property.location.line,
            property.location.column, property.name, property.value, property.comment,
          );
        });
        break;
      default:
        throw new Error(`Cannot store unsupported journal entry type: ${entry.type}`);
    }
  }

  function writeJournalDatabase(databasePath, journal) {
    validateJournal(journal);
    const resolvedDatabasePath = path.resolve(databasePath);
    const database = new Database(resolvedDatabasePath);
    database.pragma('foreign_keys = ON');
    registerDecimalFunctions(database);

    try {
      migrateDatabase(database);
      const statements = prepareStatements(database);
      const replaceContents = database.transaction(() => {
        database.exec(`
        DELETE FROM sek_prices;
        DELETE FROM journal_entries;
        DELETE FROM source_files;
        DELETE FROM metadata;
      `);

        statements.metadata.run('schema_version', SCHEMA_VERSION);
        statements.metadata.run('root_path', journal.rootPath);
        statements.metadata.run('built_at', new Date().toISOString());

        const sourceIds = new Map();
        journal.files.forEach((file, index) => {
          const fileId = index + 1;
          statements.sourceFile.run(fileId, index, file.path, file.sha256, file.size);
          sourceIds.set(file.path, fileId);
        });

        const counters = { posting: 0, resolvedAmount: 0, note: 0, property: 0 };
        const postingResolver = new PostingResolver();
        journal.entries.forEach((entry, sequence) => {
          const sourceFileId = sourceIds.get(entry.location.source);
          if (sourceFileId === undefined) {
            throw new Error(`Journal entry refers to an unregistered source file: ${entry.location.source}`);
          }
          const entryId = sequence + 1;
          statements.journalEntry.run(
            entryId, sequence, sourceFileId, entry.type, entry.location.line, entry.location.column,
          );
          insertEntry(statements, entryId, entry, counters, postingResolver);
        });

        counters.sekPrice = materializeSekPrices(database);

        return counters;
      });

      const counters = replaceContents.immediate();
      return {
        databasePath: resolvedDatabasePath,
        rootPath: journal.rootPath,
        files: journal.files.length,
        entries: journal.entries.length,
        transactions: journal.entries.filter((entry) => entry.type === 'transaction').length,
        postings: counters.posting,
        postingAmounts: counters.resolvedAmount,
        prices: journal.entries.filter((entry) => entry.type === 'price').length,
        sekPrices: counters.sekPrice,
      };
    } finally {
      database.close();
    }
  }

  return { writeJournalDatabase };
};
