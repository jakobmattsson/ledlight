# AGENTS.md

## Language

Write all code and repository-authored text in English. This includes comments,
identifiers, error messages, log messages, test descriptions and assertions,
configuration labels, and technical documentation.

Ledger fixtures may preserve source-language account names and other exact
data-facing literals when those values are part of the behavior under test.

## Module Facades

Keep the module entry points together as `src/modules/interfaces/<module>.ts`.
Keep the database schema and journal grammar under `src/modules/spec`.
Keep factory implementations under `src/modules/implementations/<module>`.
Place implementation files directly in the module directory when `internal`
would be its only child; retain subdirectories for meaningful groups.
`dependencies.yaml` and `external.ts` remain at the `src/modules` root.

Each `src/modules/interfaces/<module>.ts` defines the public facade of its
module. Keep every type used by that facade explicit and readable in the facade
file itself;
`src/public-api.d.ts` is the only permitted source for imported facade types.
Prefer a local definition over a type inferred from an internal implementation,
even when that means duplicating a definition.

Expose only capabilities used by production code outside the module. Do not
expose unused capabilities or capabilities needed only by tests; tests can
access internal registrations directly when necessary. A runtime object may
retain members under `$$private`, but those members need not appear in the
facade type and should not be treated as part of the module interface.

Shape every facade method's parameters and return value around what its
production callers need to provide or consume. Keep diagnostics, counters,
freshness reasons, intermediate results, and test-only observations inside the
owning module unless a production caller actually needs them. Do not return a
whole internal result merely because it is already available. Do not spread an
internal result into a public object; select the fields that belong to that
object's contract. Keep input registration types and the output facade type
separate when they describe different structures.

Apply the same rule to objects and class instances returned through a facade:
their facade types should include only members used by production consumers
outside the owning module. Keep implementation state and helper methods out of
the facade type even when the concrete runtime object has those members. A
stateful capability can remain in its logical owner when another module is its
only consumer; consumer count alone does not make it part of that module.

Do not copy the internal registration hierarchy into the facade when it adds
no meaning. Expose a sole public function or property directly on the facade;
group related members only when the group contains multiple public members.

Do not return a capability injected from another module unchanged as part of
an implementation factory's interface. Consumers and tests should access that
capability through the module that owns it. A facade may expose registrations
owned by its own module, and an implementation may expose an adapter when it
defines a distinct contract or behavior. Do not add a pass-through solely to
make a dependency available to tests.

## Module Ownership

Place a capability in the module that owns and uses it. When only one module
uses a standalone capability, define it in that module instead of exposing it
from another module. Keep a capability with a coherent group of related
operations even if only one other module currently uses that particular
operation. For example, decimal formatting and division belong with the other
decimal operations in `numeric`; database-specific registration of SQL decimal
functions belongs in `database`.

Judge ownership by responsibility and logical grouping, not by counting
consumers alone. A domain module may remain separate when it has one consumer.
Move a capability across a module boundary only when its responsibility is
clear. When ownership is unclear, keep the current boundary until the
responsibility is settled.

Keep module-owned type declarations inside their owning module. Use `.d.ts`
files for type-only contracts that are shared by implementations; they produce
no runtime JavaScript and are exempt from the factory registration rule.
Implementation files may use `import type` to reference these contracts or
types in other modules. Runtime JavaScript files under a module must still
export factories. Facade files retain the self-contained type rule above.

## Verification

Always run `npm test` after making code, configuration, fixture, or script
changes. Treat `npm test` as the canonical project verification command. If it
fails, fix the issue before reporting completion, or clearly report why it
could not be run.

## Test Architecture

Unit tests must be independent of any configured accounting instance. Create
the smallest representative fixture inside a test-owned temporary directory
when a test needs configuration or Ledger data.

Put tests for test support code under `tests/support`. A unit test may use other
modules as controlled dependencies, but its assertions should target the
behavior owned by its matching source file.

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
