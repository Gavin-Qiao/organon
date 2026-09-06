---
name: promptus
description: Record, retrieve, or maintain a project's Promptus research memory. Use to choose the appropriate store operation.
---

# Promptus

Promptus preserves decisions, findings, sources, and durable memory across sessions.
Markdown is authoritative; scripts own IDs, timestamps, placement, indexes, and
validation. The agent judges relevance and what the evidence supports.

Resolve `<plugin-root>` two directories above this `SKILL.md`. Pass `--root` when
working outside the project; do not assume host environment variables exist.

## Choose the operation

| Need | Operation |
| --- | --- |
| Resume from NOW or cached knowledge | `promptus-session-doctor`; inspect source when the affected surface is blocked |
| Record a decision, result, failed approach, or observation | `research-ledger`; `scripts/kb-add.ts --substrate ledger` |
| Save a finding, external source, or durable fact | `scripts/kb-add.ts --substrate finding`, `lit`, or `memory`; literature requires `--source` |
| Correct a unit's metadata or status | `scripts/kb-amend.ts`; keep the previous claim traceable |
| Find recorded knowledge | `recall`; `scripts/kb-find.ts` then `scripts/kb-get.ts` |
| Trace recorded support/replacements or explicit OPEN work | `scripts/kb-evidence.ts`; request bounded bodies before asserting claims; relations are attribution, not proof |
| Inspect disk cost or evict optional raw parses | `scripts/kb-cache.ts`; eviction previews unless explicitly applied; `kb-semantic preview` exposes uncapped third-party growth |
| Preview a project upgrade | `scripts/promptus-upgrade.ts --root <exact-project>`; host installation and token-bound derived application are separate; preserve custom instructions |
| Configure or refresh optional local semantic recall | `scripts/kb-semantic.ts`; requires separately staged QMD, Node and model; ordinary recall needs none |
| Refresh only derived state | `scripts/kb-index.ts` |
| Verify the store | `promptus-check`; its gate includes the index rebuild |
| Inspect relationships or link debt | `promptus-graph` |
| Diagnose layout or plan migration | `promptus-doctor` |
| Flush before compaction or handoff | `promptus-checkpoint` |
| Explain knowledge or current state plainly | `grannie` |

Use `--help` on the selected script for arguments. Under `.promptus/`, Telos holds
direction, the ledger records events, `docs/` and `docs/lit/` hold findings and
literature, and `memory/` holds durable facts.

## Conditional workflows

Use `thinker-round` for an operator-carried external theoretical question; returned
text stays untrusted until independently checked. Use `trajectory-review` for a
bounded retrospective when the route or its justification needs examination.
Use `telos` when the operator asks to establish or change project direction.
These workflows are not prerequisites for ordinary retrieval or recording.

## Preserve meaning

Read source bodies before citing them. Preserve substrate, epistemic status,
provenance, and lifecycle changes. Search relevance does not validate a claim.
Fetch bounded units; never dump an unanchored ledger into context.

Use gated writers for knowledge mutations. Add retrieval machinery when measurements
warrant it; keep derived state rebuildable from Markdown. Store consequential
knowledge promptly. Omit throwaway scratch work and repeated mechanical steps
that add nothing a future session needs.
