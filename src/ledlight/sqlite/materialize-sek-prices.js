'use strict';

module.exports = () => {

  function materializeSekPrices(database) {
    return database.prepare(`
    WITH RECURSIVE
      commodity_introductions AS (
        SELECT r.commodity, MIN(p.report_date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        GROUP BY r.commodity
        UNION ALL
        SELECT r.commodity, MIN(t.date) AS date
        FROM resolved_posting_amounts AS r
        JOIN postings AS p ON p.id = r.posting_id
        JOIN transactions AS t ON t.entry_id = p.transaction_id
        GROUP BY r.commodity
        UNION ALL
        SELECT commodity, MIN(date) FROM prices GROUP BY commodity
        UNION ALL
        SELECT price_commodity, MIN(date)
        FROM prices
        WHERE price_commodity IS NOT NULL
        GROUP BY price_commodity
      ),
      introductions AS (
        SELECT commodity, MIN(date) AS start_date
        FROM commodity_introductions
        GROUP BY commodity
      ),
      latest_date(value) AS (
        SELECT MAX(date) FROM (
          SELECT MAX(report_date) AS date FROM postings
          UNION ALL
          SELECT MAX(date) AS date FROM transactions
          UNION ALL
          SELECT MAX(date) AS date FROM prices
        )
      ),
      calendar(commodity, date) AS (
        SELECT i.commodity, i.start_date
        FROM introductions AS i, latest_date
        WHERE i.start_date <= latest_date.value
        UNION ALL
        SELECT calendar.commodity, date(calendar.date, '+1 day')
        FROM calendar, latest_date
        WHERE calendar.date < latest_date.value
      ),
      conversion(origin_commodity, date, current_commodity, rate, depth) AS (
        SELECT commodity, date, commodity, '1', 0
        FROM calendar
        UNION ALL
        SELECT
          conversion.origin_commodity,
          conversion.date,
          price.price_commodity,
          decimal_mul(conversion.rate, price.price_quantity),
          conversion.depth + 1
        FROM conversion
        JOIN prices AS price ON price.entry_id = (
          SELECT candidate.entry_id
          FROM prices AS candidate
          WHERE candidate.commodity = conversion.current_commodity
            AND candidate.date <= conversion.date
          ORDER BY candidate.date DESC, candidate.entry_id DESC
          LIMIT 1
        )
        WHERE conversion.current_commodity != 'SEK'
          AND conversion.depth < (SELECT COUNT(*) FROM introductions)
      )
    INSERT INTO sek_prices (commodity, date, rate)
    SELECT origin_commodity, date, rate
    FROM conversion
    WHERE current_commodity = 'SEK'
  `).run().changes;
  }

  return { materializeSekPrices };
};
