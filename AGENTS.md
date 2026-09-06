# Working in Organon

Organon contains two research plugins: `promptus/` supplies external memory and
traceability; `editio/` turns grounded research into manuscripts. Develop from
concrete problems in Mohan's projects and measure whether each change helps.
The current implementation and completion criteria are in [RELEASE-PLAN.md](RELEASE-PLAN.md),
extending the earlier candidate recorded in [OVERHAUL.md](OVERHAUL.md).

## Authority and continuity

- Hold `.promptus/TELOS.md` before acting. If its complete current content was
  supplied by the session hook, use it without a redundant read. Read the file
  when absent, truncated, changed, or in doubt.
- This file and the linked contributor/release workflows define current repository
  operating policy. Old ledger framing and historical entries describe earlier
  policy; they do not override current instructions or the operator's request.
- Before relying on resumed NOW or derived retrieval state, run
  `bun promptus/scripts/promptus-session-doctor.ts`. It is read-only. A failure
  blocks reliance on the affected state: report it, inspect source, and continue
  independent authorized work. Repair only within the requested scope.
- Retrieve existing decisions with `bun promptus/scripts/kb-find.ts "<query>"`,
  then fetch the selected path with `kb-get.ts`. Preserve status, provenance,
  and supersession when interpreting a result.

## Source and derived state

Markdown is authoritative. Indexes are disposable. Knowledge writes use gated
scripts, never freehand edits to the ledger or curated `.promptus/docs/` units.
Record consequential decisions, results, failed approaches, and evidence through
`kb-add.ts`; use `kb-amend.ts` for supported unit transitions and `kb-now.ts` for
bounded handoff updates. Record what a future session needs, not tool-call noise.

After a batch of source writes, refresh NOW as needed and run
`bun promptus/scripts/promptus-check.ts --strict`; it rebuilds the derived index
and verifies source freshness, relations, and current artifact custody. Run
`kb-index.ts` alone when only a derived refresh is needed. Before compaction,
flush unrecorded knowledge and leave a current resumable frontier.

Add databases or embeddings only after measured benefit. They may accelerate
retrieval and maintenance, but cannot decide scientific truth or replace exact
source and artifact verification. Prefer existing libraries and scripts over
new infrastructure. Keep benchmark mutations confined to disposable fixtures;
live project stores require their own explicit scope.

## Implementation and completion

- TypeScript on Bun; use `bun test` and affected tests during development.
  Run repository gates appropriate to the final change. Broaden or repeat
  verification when changes or failures justify it.
- Complete the requested implementation, relevant tests, and affected documentation.
  An intermediate diagnosis or first implementation is not completion when the
  operator asked for the finished change. Routine choices within an authorized
  workflow do not require repeated permission.
- Use specialized skills when those tasks arise: `thinker-round` for external
  theory custody, `trajectory-review` for bounded retrospectives, and Editio's
  writing/build skills for manuscripts. Load the relevant details on demand.
- Keep READMEs, templates, adapters, and metadata truthful when shipped behavior
  changes. Versions live in manifests and badges, not descriptive prose.

## Landing and release

Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [RELEASING.md](RELEASING.md).
Routine validated non-release work may land directly on `main` when requested.
Release cuts require a merged PR before tagging the exact merged commit with
`promptus-vX.Y.Z` or `editio-vX.Y.Z`. Source changes do not authorize updating an
installed plugin cache.

Commits and PR titles use `type(scope): subject`; commit bodies use flat `-`
bullets. Material agent contributions may include `- Co-authored-by: Name <email>`;
never invent a human co-author. No emoji or `--no-verify`. Use forward-slash paths.
GPL-3.0; retain the humanizer fork's upstream MIT attribution in `editio/NOTICE`.
