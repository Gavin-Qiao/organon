---
name: editio-numbers
description: One source of truth for every load-bearing number in the paper. Use when a result value appears in prose/tables/captions, when results are recomputed, or before submission — numbers.json names each value once, @num:handle binds it everywhere, editio-numbers --write/--gate keep the paper matched to the sources it came from.
---

# editio-numbers — the paper never retypes a result

The pattern this skill tools was learned from a real paper's worst week: the headline
mean (`0.872`) was typed into **eight sentences across three files**; when the source
code changed, the stale copies were caught by *luck* (an unrelated gallery build), and
the fix was a bespoke sed script with fifteen assertion-guarded replace pairs. The
team's own ledger lesson is this skill's spec:

> re-run the benchmark whenever the source changes; **verify fresh==frozen before
> trusting tables.**

The mechanism kills the copies instead of reconciling them: a value exists **once**,
everything else holds a *handle*.

## The three files

| file | role | written by |
|---|---|---|
| `numbers.json` | the paper's named values: handle → value + provenance | you (the one edit point) |
| `front/numbers.tex` | `\csname` bindings LaTeX reads | `editio-numbers --write` (never by hand) |
| `front/numbers.lock.json` | sha256 of each source file at write time | `--write` (the freshness baseline) |

```json
{ "bakeoff-mean-ari": { "value": "0.872",
    "source": ["results/g2_baseline.json"],
    "computed_by": "scratchpad/emit_bakeoff_table.py",
    "note": "all-105, failures->0" },
  "volcano-ari": "0.622" }
```

Handles are kebab-case (`[a-z0-9-]`). `value` is verbatim LaTeX — format it once,
correctly (`"0.872"`, `"8\\times10^{-4}"`, `"62\\%"`).

## Binding — write the handle, never the value

- prose: `mean ARI @num:bakeoff-mean-ari` → `\editionum{bakeoff-mean-ari}`
- math: `$\Delta = @num:bakeoff-mean-ari$` — binds inside `$…$` too
- captions/floats: works in ```` ```latex+ ```` fences (plain ```` ```latex ```` is
  byte-raw by contract — the report flags `@num:` there; use `\editionum{handle}`
  directly if the fence must stay plain)
- an unbound handle typesets as a boxed `??handle??` and a package warning — the
  render never blocks; the gate is the enforcement

## The loop

1. **Name** the load-bearing numbers as they enter the paper — headline means,
   deltas, p-values, counts that a reviewer would quote. (Page numbers, years,
   section counts don't earn handles.)
2. `editio-numbers --write` after any `numbers.json` edit — regenerates the
   bindings and locks the source hashes.
3. **When sources change** (the gate goes STALE): re-run the pipeline named in
   `computed_by`, verify fresh==frozen, update the value in `numbers.json`, `--write`.
   A deliberate freeze is `"pinned": "reason"` — it passes the gate *on the record*.
4. **Before submission**: `editio-numbers --gate` — exit 1 on unknown handles,
   `@num:` in byte-raw fences, stale unpinned sources, or bindings older than
   `numbers.json`. Runs beside `editio-status --gate`.

## What binding does NOT absolve

- **The sentence around the number.** In the field case, half the corrections
  flipped *verdict words* — "within noise" became "significant", "ties" became
  "leads". A changed value can invalidate the claim it sits in: re-read the
  sentence and **re-grade the claim span** (the grounds/claims gate is the
  verdict-level check; this skill is the value-level one).
- **Re-running the pipeline.** editio never executes your experiments (script
  over server); `computed_by` names what *you* re-run.
- **Tables.** Generated tables are `editio-tables`' job (Phase 4); until then,
  emit them from the same sources and cite the same handles in captions.
- **The audit trail.** A corrected number is a ledger event — `kb-add` the
  MISTAKE/correction so the store remembers what changed and why.

## References

The craft is distilled from cited sources — see
[`references/sot-numbers.md`](references/sot-numbers.md): reproducible-research
provenance (Claerbout & Karrenbach), inline computed values (`\Sexpr` in Sweave;
knitr), and the version-control/audit rules this gate mechanizes (Sandve et al.,
Rules 4 and 10).
