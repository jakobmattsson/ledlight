# CLI transcript cases

Each `.case` file in this directory runs as one integration test in the current
process. Any text before the first section is a human-readable comment; it
needs no `#` prefix. Put one blank line immediately before and after every
`========== NAME ==========` heading. The reader removes those surrounding
blank lines before using the section content.

`========== CLI ==========` contains a `ledlight` command. It is optional when
an API section is present. Command arguments support quoted strings and
backslash escapes, but no shell is run. Omit `--file`; the case supplies the
journal in one of two ways:

- End the command in CLI with `<<'LEDGER'`, put the journal below it, and close
  it with a line containing only `LEDGER`. This exercises piped standard input.
- Omit the heredoc and put the journal in `========== FILE ==========`. The
  test writes it to a temporary file and supplies that path as `--file` when
  CLI is present. FILE is required when CLI is absent.

Use `========== OUTPUT ==========` for the CLI output or the JSON form of an
API-only result. Use `========== WARNINGS ==========` for formatted journal
warnings. `========== ERROR ==========` expects an exception message; a CLI
case also verifies exit code 1, and a case with both CLI and API verifies that
both paths raise the same error. An absent ERROR section requires success.
OUTPUT and WARNINGS are optional; an empty section asserts an empty value.
Whitespace and final newlines in present sections are compared exactly.

`========== API ==========` contains one journal method call, such as
`aggregate({ accounts: ['^Assets:'] })` or `tags({})`. Write it as a JavaScript
statement. With CLI, the test compares the API result with the CLI's JSON
output. For accounts, tags, and commodities, this comparison uses the CLI's
name-only representation unless `--details` is present. Use JSON CLI output
when including API. Without CLI, the API result becomes JSON OUTPUT and journal
warnings become WARNINGS. An API section can be used without a fixed OUTPUT
expectation when CLI is present.

The reader accepts sections in any order. By convention, write them as CLI,
API, FILE, OUTPUT, WARNINGS, then ERROR, omitting unused sections.
