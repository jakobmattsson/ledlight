# AGENTS.md

## Language

Write all code and repository-authored text in English. This includes comments,
identifiers, error messages, log messages, test descriptions and assertions,
configuration labels, and technical documentation.

Ledger fixtures may preserve source-language account names and other exact
data-facing literals when those values are part of the behavior under test.

## Verification

Always run `npm test` after making code, configuration, fixture, or script
changes. Treat `npm test` as the canonical project verification command. If it
fails, fix the issue before reporting completion, or clearly report why it
could not be run.

## Test Architecture

Unit tests must be independent of any configured accounting instance. Create
the smallest representative fixture inside a test-owned temporary directory
when a test needs configuration or Ledger data.

Automated tests must not wait for real time to pass. Inject a clock or timer,
use fake timers, or advance the condition directly when testing timestamps,
retries, delays, or timeouts.

## Codex Checkpoints

This checkpoint workflow applies only in linked Git worktrees, never in the
primary checkout. Follow any explicit user instruction not to commit or push;
when such an instruction conflicts with the automated checkpoint workflow, do
not run the checkpoint command.

Before the final response for a task that changed repository files in a linked
worktree, review the completed diff and checkpoint the work. If the worktree is
on `main` or has a detached `HEAD`, first create and switch to a descriptive
branch with the `codex/` prefix.

Run `npm exec --no -- worktree-keeper checkpoint-codex-changes --subject
"<subject>" --body "<body paragraph>"`, repeating `--body` when useful. Use a
concise, single-line English subject and an English body of one to ten sentences
that explains the change. Do not include unrelated changes, and unless an
explicit user instruction disables the workflow, finish only after the
checkpoint succeeds.
