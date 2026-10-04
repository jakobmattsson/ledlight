'use strict';

module.exports = ({
  path,
  sqlite: Database,
  decimal: { registerDecimalFunctions },
  postingResolver: { PostingResolver },
  journalValidator: { validateJournal },
  journalValuationCommodity: { valuationCommodityFromJournal },
  valuationPriceMaterializer: { materializeValuationPrices },
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
      databaseMetadata: database.prepare('INSERT INTO database_metadata (key, value) VALUES (?, ?)'),
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
        (entry_id, date, description, payee, narration, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      posting: database.prepare(`
      INSERT INTO postings
        (id, transaction_id, position, report_date, line, column, account,
         amount_quantity, amount_commodity,
         lot_cost_quantity, lot_cost_commodity, lot_cost_is_total,
         cost_quantity, cost_commodity, cost_is_total,
         balance_assignment_quantity, balance_assignment_commodity,
         balance_assertion_quantity, balance_assertion_commodity, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      transactionTag: database.prepare(`
      INSERT INTO transaction_tags
        (id, transaction_id, note_id, position, name, value)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
      postingTag: database.prepare(`
      INSERT INTO posting_tags (id, posting_id, position, name, value)
      VALUES (?, ?, ?, ?, ?)
    `),
      price: database.prepare(`
      INSERT INTO prices
        (entry_id, date, base_commodity, quote_quantity, quote_commodity, comment)
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

  function insertTransaction(statements, entryId, entry, counters, resolvedPostings) {
    statements.transaction.run(
      entryId, entry.date, entry.description, entry.payee, entry.narration, entry.comment,
    );

    entry.postings.forEach((posting, position) => {
      const amount = amountFields(posting.amount);
      const lotCost = amountFields(posting.lotCost && posting.lotCost.amount);
      const cost = amountFields(posting.cost && posting.cost.amount);
      const assignment = amountFields(posting.balanceAssignment);
      const assertion = amountFields(posting.balanceAssertion);
      const postingId = ++counters.posting;
      statements.posting.run(
        postingId, entryId, position, posting.postingDate || entry.date,
        posting.location.line, posting.location.column,
        posting.account, amount.quantity, amount.commodity,
        lotCost.quantity, lotCost.commodity, posting.lotCost ? Number(posting.lotCost.total) : null,
        cost.quantity, cost.commodity, posting.cost ? Number(posting.cost.total) : null,
        assignment.quantity, assignment.commodity, assertion.quantity, assertion.commodity,
        posting.comment,
      );
      resolvedPostings[position].forEach((resolvedAmount, amountPosition) => {
        statements.resolvedPostingAmount.run(
          ++counters.resolvedAmount, postingId, amountPosition,
          resolvedAmount.quantity, resolvedAmount.commodity,
        );
      });
      (posting.tags || []).forEach((tag, tagPosition) => {
        statements.postingTag.run(
          ++counters.postingTag, postingId, tagPosition, tag.name, tag.value,
        );
      });
    });

    let tagPosition = 0;
    const noteTagCount = entry.notes.reduce((count, note) => count + (note.tags || []).length, 0);
    const headerTags = (entry.tags || []).slice(0, (entry.tags || []).length - noteTagCount);
    headerTags.forEach((tag) => {
      statements.transactionTag.run(
        ++counters.transactionTag, entryId, null, tagPosition++, tag.name, tag.value,
      );
    });
    entry.notes.forEach((note, position) => {
      const noteId = ++counters.note;
      statements.note.run(
        noteId, entryId, position, note.location.line, note.location.column,
        note.text, note.key, note.value,
      );
      (note.tags || []).forEach((tag) => {
        statements.transactionTag.run(
          ++counters.transactionTag, entryId, noteId, tagPosition++, tag.name, tag.value,
        );
      });
    });
  }

  function insertEntry(
    statements, entryId, entry, counters, resolvedTransactions, ignoredProperties,
  ) {
    switch (entry.type) {
      case 'transaction':
        insertTransaction(statements, entryId, entry, counters, resolvedTransactions.get(entry));
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
        entry.properties.filter((property) => !ignoredProperties.has(property))
          .forEach((property, position) => {
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
    const warnings = [...(journal.warnings || [])];
    const ignoredProperties = new Set();
    const valuationCommodity = valuationCommodityFromJournal(
      journal, warnings, ignoredProperties,
    );
    const validation = validateJournal(journal, valuationCommodity, warnings);
    const postingResolver = new PostingResolver(validation.warnings);
    const resolvedTransactions = new Map();
    for (const entry of journal.entries) {
      if (validation.invalidEntries.has(entry) || entry.type !== 'transaction') continue;
      const resolved = postingResolver.resolve(entry);
      if (resolved) resolvedTransactions.set(entry, resolved);
    }
    const storableEntries = journal.entries.filter((entry) =>
      !validation.invalidEntries.has(entry) &&
      (entry.type !== 'transaction' || resolvedTransactions.has(entry)));
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

        const sourceIds = new Map();
        journal.files.forEach((file, index) => {
          const fileId = index + 1;
          statements.sourceFile.run(fileId, index, file.path, file.sha256, file.size);
          sourceIds.set(file.path, fileId);
        });

        const counters = {
          posting: 0,
          resolvedAmount: 0,
          note: 0,
          property: 0,
          transactionTag: 0,
          postingTag: 0,
        };
        storableEntries.forEach((entry, sequence) => {
          const sourceFileId = sourceIds.get(entry.location.source);
          if (sourceFileId === undefined) {
            throw new Error(`Journal entry refers to an unregistered source file: ${entry.location.source}`);
          }
          const entryId = sequence + 1;
          statements.journalEntry.run(
            entryId, sequence, sourceFileId, entry.type, entry.location.line, entry.location.column,
          );
          insertEntry(
            statements, entryId, entry, counters, resolvedTransactions, ignoredProperties,
          );
        });

        validation.warnings.forEach((warning, position) => {
          insertWarning.run(
            position, warning.code, warning.message, warning.source, warning.line, warning.column,
            warning.startLine, warning.endLine,
          );
        });

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
