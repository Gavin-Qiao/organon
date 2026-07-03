---
name: research-ledger
description: Proactively record a research project into Promptus as work happens — append a unit after every decision, run, observation, dead-end, or finding via kb-add (never freehand). Teaches the recording habit so the ledger fills itself instead of being reconstructed later. The script owns the timestamp, id, and placement (the drift fix). Pairs with /checkpoint.
---

# research-ledger — record as you go

A research ledger is the lab notebook for a long investigation: what you tried, what
happened, what broke, what you fixed, what you abandoned and why. It makes the work
**compounding and compaction-safe** — a fresh (or post-compaction) session resumes from
the file alone with nothing important lost. It is in the spirit of Karpathy's llm-wiki (raw sources + an LLM-maintained wiki +
an `AGENTS.md` "schema", plus an append-only log), adapted as a lab notebook where the
**append-only log is the spine** and the wiki is distilled *from* it at `/checkpoint` — a
deliberate inversion of the gist's coequal layers, ours and not Karpathy's own ordering.

## Two parts of the ledger

`.promptus/ledger/RESEARCH-LEDGER.md` has a small **NOW-header** (always rewritten to stay current —
the compaction-safe core a resuming agent reads instead of the whole file) and an
**append-only Log** below a `<!-- kb:append-point -->` sentinel.

## The recording reflex — append through the gate, never freehand

During real work, watch for the moments worth keeping and write each the moment it happens:

```
echo "<prose body>" | bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" \
  --substrate ledger --kind <KIND> --status <STATUS> --title "<short imperative title>" [--links "a,b"] [--supersedes <id>]
```

The script stamps the local `### [YYYY-MM-DD HH:MM:SS] KIND/STATUS — title` header from the
system clock, mints the id, inserts above the sentinel, and refreshes the catalog. **Never
hand-type a `### [ts]` line** — hand-typed timestamps drift (that is how a past ledger lost a
day). Reserve hand-editing for the NOW-header, at `/checkpoint`.

## Three facets: KIND, STATUS, RELATION

Keep them distinct — KIND is the *act*, STATUS is the *claim's epistemic state*, RELATION is a
*typed link to another unit*. The header reads `KIND/STATUS`.

**KIND (`--kind`)** — core: `PLAN` · `EXP` · `RESULT` · `FINDING` · `DECISION` · `RESEARCH` ·
`RESUME`; blessed extensions: `IDEA` · `MISTAKE` · `FIX` · `DEADEND`. Negative results are
first-class: a `DEADEND` or `MISTAKE` earns the same care as a `RESULT` — why something failed
is often worth more than what worked.

**STATUS (`--status`)** — core: `CONJECTURED` / `VALIDATED` / `REFUTED` / `CONFOUNDED`
(renders `⚠CONFOUNDED`; an observation with more than one explanation) / `SUPERSEDED`; blessed
extensions: `OPEN` / `RESOLVED` / `WONTFIX`. Promote to `VALIDATED` only with the evidence named
(a passing test, a proof, a measured delta vs a control). The ledger is **permissive** — an
off-vocab status is warned about but still written, so you never lose a thought to the gate; add
it to `.promptus/schema/kb-vocab.json` if it's here to stay. (finding / lit / memory stay strict.)

**RELATION (`--rel <type>:<id>`, or `--supersedes <id>`)** — typed edges between units:
`supersedes` (marks the target `SUPERSEDED` — this is the correction mechanism), `refutes`,
`challenges`, `supports`, `extends`, `fixes`. They export to CiTO / PROV-O via
`bun scripts/kb-export.ts`. Example headers: `RESULT/VALIDATED`, `DEADEND/REFUTED`, `RESULT/CONFOUNDED`.

## Disciplines that make it worth keeping

1. **Artifact-coupling.** Every `RESULT` names a reproducible artifact (path or run-id) *and*
   quotes the key number inline, so a reader can spot-check without opening it.
2. **Failure-first honesty.** Record what broke and why. The `DEADEND` trail is the most
   valuable part of the file.
3. **Attribution.** Say what produced a claim (a run, a proof, a model, the operator).
4. **Backward links.** New entries reference what they build on or overturn (`[ts]`, `[[link]]`),
   so the file reads as a causal chain, not a pile.
5. **No justification-free constants.** When you introduce a threshold, record why in the same entry.

## Keeping it readable (the bloat rule)

The NOW-header stays small and current — it is what gets read. At `/checkpoint`, distill recent
entries into `docs/` finding pages (one concept per file, `[[linked]]`, via `kb-add --substrate
finding`). When the Log passes a few thousand lines, archive older sections to
`ledger/archive/<YYYY-MM>.md` and leave a one-line pointer — history preserved, never rewritten.

## Standing cadence (put this in the project's AGENTS.md)

> Maintain the research ledger: append a unit after every completed unit of work — including
> mistakes, fixes, dead-ends, and brainstorms, not only successes — with
> `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate ledger …` (never hand-type `### [ts]`). Refresh the
> NOW-header and run `/checkpoint` before compaction.
