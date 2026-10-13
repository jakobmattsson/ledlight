# AGENTS.md

## Language

Write all code and repository-authored text in English. This includes comments,
identifiers, error messages, log messages, test descriptions and assertions,
configuration labels, and technical documentation.

Ledger fixtures may preserve source-language account names and other exact
data-facing literals when those values are part of the behavior under test.

## Module Facades

Each `src/modules/**/index.ts` defines the public facade of its module. Keep
every type used by that facade explicit and readable in the index file itself;
`src/public-api.ts` is the only permitted source for imported facade types.
Prefer a local definition over a type inferred from an internal implementation,
even when that means duplicating a definition.

Expose only capabilities used by production code outside the module. Do not
expose unused capabilities or capabilities needed only by tests; tests can
access internal registrations directly when necessary. A runtime object may
retain members under `$$private`, but those members need not appear in the
facade type and should not be treated as part of the module interface.

Do not copy the internal registration hierarchy into the facade when it adds
no meaning. Expose a sole public function or property directly on the facade;
group related members only when the group contains multiple public members.

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
