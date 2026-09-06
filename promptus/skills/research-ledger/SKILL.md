---
name: research-ledger
description: Record consequential decisions, results, failed approaches, and evidence in a Promptus project's research ledger.
---

# research-ledger — record as you go

**Portable path rule:** in commands below, replace `<plugin-root>` with the absolute plugin root
two directories above this `SKILL.md`. Resolve it from the loaded skill path; do not assume a
host-specific environment variable exists in the project shell.

A research ledger is the lab notebook for a long investigation: what you tried, what
happened, what broke, what you fixed, what you abandoned and why. It makes the work
**compounding and compaction-safe** — a fresh (or post-compaction) session resumes from
the file alone with nothing important lost. It is in the spirit of Karpathy's llm-wiki (raw sources + an LLM-maintained wiki +
an `AGENTS.md` "schema", plus an append-only log), adapted as a lab notebook where the
**append-only log is the spine** and the wiki is distilled *from* it at checkpoint — a
deliberate inversion of the gist's coequal layers, ours and not Karpathy's own ordering.

## Two parts of the ledger

`.promptus/ledger/RESEARCH-LEDGER.md` has a small **NOW-header** (always rewritten to stay current —
the compaction-safe core a resuming agent reads instead of the whole file) and an
**append-only Log** below a `<!-- kb:append-point -->` sentinel.

## The recording reflex — append through the gate, never freehand

Record consequential changes in what the project knows promptly. A completed
experiment, decision, failed approach, or new evidence merits a unit. Repeated
tool calls and routine checks that change no conclusion do not each need an entry.
Batch derived maintenance while keeping perishable knowledge recorded:

```
echo "<prose body>" | bun "<plugin-root>/scripts/kb-add.ts" \
  --substrate ledger --kind <KIND> --status <STATUS> --title "<short imperative title>" [--links "a,b"] [--supersedes <id>]
```

The script stamps the local `### [YYYY-MM-DD HH:MM:SS] KIND/STATUS — title` header from the
system clock, mints the id, inserts above the sentinel, and refreshes the catalog. **Never
hand-type a `### [ts]` line** — hand-typed timestamps drift (that is how a past ledger lost a
day). Explicit `--links` are serialized into the entry so an authoritative reindex cannot erase
them. Concurrent `kb-add`/`kb-now` processes serialize and atomically replace the ledger, so one
agent cannot overwrite another's event. The checkpoint refreshes the NOW-header through `kb-now`,
never by freehand ledger editing.

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
`bun "<plugin-root>/scripts/kb-export.ts"`. Example headers: `RESULT/VALIDATED`, `DEADEND/REFUTED`, `RESULT/CONFOUNDED`.

## A research effort has three homes — the digest is the one that gets skipped

A deep-research (your own, or an agent team's report) is not stored when its *event* is:

| what | home | via |
|---|---|---|
| that it happened, what was decided | ledger | `kb-add --substrate ledger` (as you go) |
| the sources it read | lit | `kb-add --substrate lit --source …` (one per source) |
| **what we now know — the digested reasoning** | **finding** | `kb-add --substrate finding` |

The first two happen naturally; the third is the one a real project went dark on for a
week (ledger events and 44 lit units accumulating, zero new findings). An in-conversation
research report is **perishable** — compaction keeps the conclusion but destroys the
reasoning, the alternatives weighed, and the methodology. If a report earned tokens,
digest it into a finding unit *in the same session*: terse, linky (`[[lit-slugs]]`),
stating what was adopted, what was rejected and why, and where any shipped artifact of it
lives. The ledger entry then records only the event, as it should.

## Disciplines that make it worth keeping

1. **Artifact-coupling.** Every `RESULT` names a reproducible artifact *and* quotes the key number
   inline. Prefer repeated `--artifact "role|relative/path|sha256-or--"`; `promptus-check` then
   verifies existence and, when supplied, exact bytes.
2. **Failure-first honesty.** Record what broke and why. The `DEADEND` trail is the most
   valuable part of the file.
3. **Attribution.** Say what produced a claim (a run, a proof, a model, the operator).
4. **Backward links.** New entries reference what they build on or overturn (`[ts]`, `[[link]]`),
   so the file reads as a causal chain, not a pile.
5. **No justification-free constants.** When you introduce a threshold, record why in the same entry.

## Keeping it readable (the bloat rule)

The NOW-header stays small and current — it is what gets read. A checkpoint stores only
unrecorded knowledge and refreshes the handoff; do not re-distill settled entries. Archive
maintenance is a separate, scoped operation justified by measured retrieval or maintenance
cost, not a line-count trigger or an implicit part of checkpointing. Preserve exact unit
bytes, identities and lifecycle links when an archive operation is authorized.

## Standing cadence (put this in the project's AGENTS.md)

> Maintain the research ledger: record consequential completed work — including
> mistakes, fixes, dead-ends, and useful hypotheses — with
> `bun "<plugin-root>/scripts/kb-add.ts" --substrate ledger …` (never hand-type `### [ts]`). Refresh the
> NOW-header and run the `promptus-checkpoint` workflow before compaction.
