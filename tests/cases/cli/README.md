# CLI transcript cases

Each `.case` file in this directory runs as one integration test in the current
process. Start with optional `#` comment lines and a `ledlight` command. The
command arguments support quoted strings and backslash escapes, but no shell is
run. Omit `--file`; the case supplies the journal in one of two ways:

- End the command with `<<'LEDGER'`, put the journal below it, and close it with
  a line containing only `LEDGER`. This exercises piped standard input.
- Omit the heredoc and put the journal in `========== FILE ==========`. The
  test writes it to a temporary file and supplies that path as `--file`.

Use `========== STDOUT ==========` and `========== STDERR ==========` to mark
exact output expectations. Each is optional. An omitted section is not checked;
an empty section asserts empty output. Whitespace and final newlines in present
sections are compared exactly.

`========== API ==========` contains one journal method call, such as
`aggregate({ accounts: ['^Assets:'] })` or `tags({})`. The options use YAML flow
object syntax. The test calls that method on a journal opened from the same
content and compares its result with the CLI's JSON output. For accounts, tags,
and commodities, the comparison uses the CLI's name-only representation unless
`--details` is present. Use JSON CLI output when including an API section. An
API section can be used without a fixed STDOUT expectation. Sections can appear
in any order after the journal input.
