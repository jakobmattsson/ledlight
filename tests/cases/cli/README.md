# CLI transcript cases

Each `.case` file in this directory runs as one integration test in the current
process. Text before the first section is a human-readable comment. Put one
blank line immediately before and after every `========== NAME ==========`
heading. The reader removes those surrounding blank lines before using the
section content.

`========== CLI ==========` contains a `ledlight` command. It is optional when
an API or LEDGER-CLI section is present. Command arguments support quoted strings and
backslash escapes, but no shell is run. Omit `--file`; the case supplies the
journal in one of two ways:

- End the command in CLI with `<<'LEDGER'`, put the journal below it, and close
  it with a line containing only `LEDGER`. This exercises piped standard input.
- Omit the heredoc and put the journal in `========== FILE ==========`. The
  test writes it to a temporary file and supplies that path as `--file` when
  CLI is present. FILE is required when CLI is absent.

`========== LEDGER-CLI ==========` contains a `ledger` command. The runner
executes the configured Ledger binary and supplies the same journal path as an
implicit `--file` argument. Its output is compared against the same sections
as CLI and API. Set `LEDGER_BIN` to use a Ledger binary outside `PATH`.

For journals with includes, add `========== FILE relative/path.ledger ==========`
sections. Each creates a file relative to the temporary journal directory.

Use `========== OUTPUT ==========` for the CLI output or the JSON form of an
API-only result. Use `========== WARNINGS ==========` for formatted journal
warnings. `========== ERROR ==========` expects an exception message; a CLI
case also verifies exit code 1, and a case with both CLI and API verifies that
both paths raise the same error. An absent ERROR section requires success.
OUTPUT and WARNINGS are optional; an empty section asserts an empty value.
Whitespace and final newlines in present sections are compared exactly.
Use `{{JOURNAL_PATH}}` or `{{FILE:relative/path.ledger}}` in an expectation when
the output contains the temporary path of the main journal or an included file.
The runner substitutes those paths before the exact comparison.

`========== API ==========` contains one journal method call, such as
`aggregate({ accounts: ['^Assets:'] })` or `tags({})`. Write it as a JavaScript
statement with JSON-like literal arguments: strings, numbers, booleans, null,
arrays, and objects with quoted or unquoted keys. Expressions such as
`new Date(...)` are not supported. Date options are ISO calendar-date strings
in `YYYY-MM-DD` form. The API result is formatted as JSON OUTPUT, and journal
warnings become WARNINGS. When a case contains both CLI and API, each path is compared
independently with the same OUTPUT, WARNINGS, and ERROR sections. Include only
the expectations relevant to the case.

The reader accepts sections in any order. By convention, write them as CLI,
LEDGER-CLI, API, FILE, extra FILE sections, OUTPUT, WARNINGS, then ERROR,
omitting unused sections.
