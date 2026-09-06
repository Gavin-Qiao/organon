# Research continuity and grounded writing

Finalized cross-plugin summary, reconciled into the published
[Promptus release](https://github.com/Gavin-Qiao/organon/releases/tag/promptus-v0.10.0) and
[Editio release](https://github.com/Gavin-Qiao/organon/releases/tag/editio-v0.8.0).
Each plugin's versioned CHANGELOG.md remains the publication source; this is not a monorepo
release. [Delivery status](../../RELEASE-STATUS.md) separates publication from project adoption.

## Promptus

- Add source-backed evidence navigation, actionable resume diagnostics and
  preview-first project adoption without automatic host installation or source migration.
- Add resource inspection and explicit optional local semantic retrieval. Lexical
  retrieval remains default; no GPU, model download or database is required.
- Keep persistent raw-parse caching opt-in after production acceptance showed
  overhead. Do not advertise prototype maintenance results as production speedups.
- Replace shell-detected post-command indexing with explicit batch maintenance.
  Existing project instructions must retain the index/health cadence.

## Editio

- Resolve manuscript grounds through the packaged canonical source reader,
  including stable IDs, aliases, archived evidence and effective lifecycle status.
- Add historical claim spans without treating rejected evidence as positive support.
- Correct standalone previews and keep status/audit requests read-only.

## Compatibility and delivery

No overhaul-specific Markdown migration is required. Stricter grounding may reject
previously accepted stale or ambiguous claims; inspect evidence rather than weaken
the gate. Older Editio versions do not grade new historical annotations, so rollback
must account for manuscript compatibility. Host installation and per-project adoption
remain separate from release publication. See MIGRATION.md for scope and recovery.
