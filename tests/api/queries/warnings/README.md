# Warning catalog

Each warning code in `src/impl/ingestion/ingestion-warning.js` has one named,
executable example in this directory. The `.case` files exercise a complete
Ledger journal through the public API or CLI and compare the exact formatted
warnings. Some examples also produce other warnings; their named code is the
condition they illustrate. The integration test in
`tests/integration/src/api/warning-examples.test.js` checks that the filenames
match the complete warning-code list and that every example emits its named
code.

`AMBIGUOUS_BALANCE_ASSIGNMENT` and `MISSING_COMMODITY` need constructed parser
results. Ledger text without the required commodity is rejected by the parser,
so their `.example.js` files change a parsed journal in memory and run the
relevant validator. They cannot currently be produced by an ordinary journal
file. The other examples use `.case` files.

| Warning code | Check or invariant demonstrated |
| --- | --- |
| `AMBIGUOUS_BALANCE_ASSIGNMENT` | A balance assignment has no commodity and the account's existing holdings do not identify one. |
| `BALANCE_ASSERTION_FAILED` | The resulting account balance differs from an asserted balance. |
| `DUPLICATE_ACCOUNT_DECLARATION` | An account is declared twice; the first declaration remains authoritative. |
| `DUPLICATE_COMMODITY_DECLARATION` | A commodity is declared twice; the first declaration remains authoritative. |
| `DUPLICATE_TAG_DECLARATION` | A tag is declared twice; the first declaration remains authoritative. |
| `FOREIGN_LOT_COST_CURRENCY` | An investment lot uses a cost commodity other than the default valuation commodity. |
| `IMPOSSIBLE_COST_BASIS` | A disposal's booked cost lies outside the range allowed by acquired lots. |
| `INVALID_COMMODITY_TRADE` | A posting violates the supported commodity and cost annotation rules. |
| `MISSING_COMMODITY` | A parsed amount lacks a commodity and its entry cannot be stored. |
| `MISSING_COMMODITY_FORMAT` | A commodity declaration lacks a `format` property. |
| `MULTIPLE_DEFAULT_COMMODITIES` | More than one commodity is marked `default`; the first is used. |
| `MULTIPLE_IMPLICIT_POSTINGS` | A transaction has more than one posting with an inferred amount and cannot be resolved. |
| `NEGATIVE_POSTING_DATE_HOLDING` | A disposal precedes the available acquisition when posting dates are used. |
| `RESIDUAL_COST_BASIS` | A closed position still has nonzero booked cost basis. |
| `RESULT_MISMATCH` | Realized plus unrealized result differs from cash flows and remaining market value. |
| `SALE_PROCEEDS_MISMATCH` | No combination of monetary postings explains the recorded sale price. |
| `SYNTAX_ERROR` | A malformed top-level block is skipped during parser recovery. |
| `UNBALANCED_TRANSACTION` | A transaction's resolved postings leave a nonzero residual. |
| `UNDECLARED_ACCOUNT` | A posting uses an account before its declaration. |
| `UNDECLARED_COMMODITY` | A posting or price uses a commodity before its declaration. |
| `UNDECLARED_TAG` | A transaction or posting uses a tag before its declaration. |

For any new warning code, add an example with the exact code as its filename.
The meta test will fail until it exists. Add its check to this table as well.
