---
name: recall
description: Retrieve what a project already knows, with provenance and status, before asserting it. Use when grounding a statement, answering "what did we decide / find / read about X", or checking a draft's claims against the store. Auto-invoke by judgement whenever a claim could be verified against recorded knowledge. Drives kb-find; verifies each claim against its source before synthesizing.
---

# recall — retrieval reasoning

**Portable path rule:** in commands below, replace `<plugin-root>` with the absolute plugin root
two directories above this `SKILL.md`. Resolve it from the loaded skill path; do not assume a
host-specific environment variable exists in the project shell.

Turn a question into grounded, cited knowledge. This is the reasoning layer over
`scripts/kb-find.ts` — and where grounding lives (style stays with editio's humanizer). It is
**auto-invoked by judgement**: if a claim under discussion could be checked against the
store, check it rather than asserting from memory.

## Procedure

1. **Decompose.** Break the question into retrievable sub-questions. A multi-hop question
   ("does our method beat the baseline on the hard cases?") splits into facts you can look up.
2. **Retrieve header-first, then fetch only what you need.** Two tiers — find the headers, then
   pull just the bodies the headers earned. For each sub-question:
   ```
   bun "<plugin-root>/scripts/kb-find.ts" "<sub-question>" [--all] [--substrate ledger|finding|lit|memory] [--status <S>] [--hops <n>] [--snippet]
   ```
   Retrieval is ranked and capped at 20 by default: read the returned headers (add `--snippet` to see the matched
   line), decide which units are worth the body, then fetch just those — never the whole ledger:
   ```
   bun "<plugin-root>/scripts/kb-get.ts" "<path>" [--title "<title>"]   # <path> = kb-find's 3rd ` · ` column
   ```
   `kb-get` returns one unit's text — a page's whole file, or a single ledger entry's slice (not
   the ~200 it shares a file with); unanchored ledgers are refused. `--title` disambiguates a
   same-second anchor. Widen `--hops` (1–2) for associative neighbours. Add `--history` only when
   the question genuinely asks about archived, refuted, or superseded work.
3. **Confidence-gate on status** — this is the calibration source:
   - `ledger:CONJECTURED`, `finding:CONJECTURED`, `memory:provisional` → **weak**; hedge.
   - `finding:VALIDATED`, `ledger:VALIDATED`, `memory:validated` → **firm**; state plainly.
   - `lit:CITE` → citable prior art; attribute it by name.
   - `ledger:DEADEND`, `finding:REFUTED`, `finding:SUPERSEDED` → say it failed / was overturned.
   - `finding:REVIEW` → a bounded retrospective, not a project decision or independent scientific
     source. Preserve its fact/inference boundary and fetch the underlying units before reusing a
     load-bearing claim or recommendation.
4. **Verify.** Read each unit you cite — its body via `kb-get` (a page or a ledger slice), or a
   lit unit's `source#anchor` at the real source. Do **not** pass through a unit you didn't read.
   If the store doesn't back the claim, say *unsupported*, don't invent.
5. **Synthesize.** Answer in the form the caller (grannie, a reviewer, editio's humanizer) can render
   honestly: each point carries its `substrate:status` and its citation.

## Output shape

```
<claim> — <substrate:status> — <source#anchor or path>
```

If nothing is found, say so plainly and suggest storing it once it's known. Retrieval that
invents coverage is worse than retrieval that admits a gap.
