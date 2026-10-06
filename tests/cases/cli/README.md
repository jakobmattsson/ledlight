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

Use `========== STDOUT ==========` and `========== STDERR ==========` to mark
exact output expectations. Each is optional. An omitted section is not checked;
an empty section asserts empty output. Whitespace and final newlines in present
sections are compared exactly.

`========== API ==========` contains one journal method call, such as
`aggregate({ accounts: ['^Assets:'] })` or `tags({})`. The options use YAML flow
object syntax. With CLI, the test compares the API result with the CLI's JSON
output. For accounts, tags, and commodities, this comparison uses the CLI's
name-only representation unless `--details` is present. Use JSON CLI output
when including API. Without CLI, the API result becomes JSON stdout and journal
warnings become stderr. An API section can be used without a fixed STDOUT
expectation. Sections can appear in any order.
