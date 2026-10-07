# Parser cases

Each `.case` file defines one parser behavior through Ledger source text and an
expected syntax tree or syntax error. The same case runs against the runtime
parser and the reference parser. A `WARNINGS` section checks recovery from
malformed top-level blocks.

Start each file with a short English description. Put one blank line before and
after each `========== NAME ==========` heading. The reader removes those
surrounding blank lines, preserving the Ledger source text exactly.

Use `TEXT` for the Ledger source, followed by exactly one of `JSON` or `ERROR`.
An optional `WARNINGS` section follows `JSON`.
