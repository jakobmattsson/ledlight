# CLI transcript cases

Each `.case` file in this directory runs as one integration test. Start with
optional `#` comment lines, then a `ledlight` command ending in `<<'LEDGER'`.
Put the complete journal between that line and a line containing only `LEDGER`.
The command arguments support quoted strings and backslash escapes; the test
does not run a shell or start a Ledlight process. Omit `--file`, because the
heredoc is supplied as standard input.

A line containing only `====================` starts the expected stdout.
A second separator starts the expected stderr; omit it when stderr is empty.
The contents of each section, including blank lines and the final newline, are
compared exactly. Put two separators together when stdout is empty but stderr
is expected.
