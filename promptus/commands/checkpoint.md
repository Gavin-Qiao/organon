---
description: Minimal pre-compaction flush — sweep the session for anything not yet stored and add it through kb-add, refresh the NOW-header, keep memory fresh, re-index, and run a short drift check against the Telos (read-only — Telos edits are operator-triggered). Doesn't rebuild the wheel; the research-ledger skill owns the format.
argument-hint: "[optional scope note]"
---

# /checkpoint — minimal flush before compaction

Goal: lose nothing to the compaction. This is a thin **check-and-add**, not a re-run of the
whole methodology — the `research-ledger` skill owns the format (kinds, status tags, the
NOW-header); load it if you need the spec. Work from facts; never invent entries.

1. **Check.** Sweep the session for anything that exists only in the conversation, not yet in
   a store — decisions, runs, observations, dead-ends, fixes, findings, prior art read —
   **including any research report delivered in-conversation** (a deep-research, an agent
   team's findings): its reasoning is perishable — compaction keeps the conclusion and
   destroys the why. Digest each such report into a `finding` unit (what we now know, what
   was rejected and why, `[[links]]` to its lit units), not just a ledger event; the
   `research-ledger` skill's "three homes" table is the rule.
   A draft trajectory review is the exception to automatic digestion: persist it as
   a finding with `--kind REVIEW` only when the operator explicitly authorizes that second act. Store any
   separately accepted project decision through the ordinary ledger/Telos/NOW boundary.
2. **Add** each through the gate (the script owns the timestamp / id / placement):
   ```
   echo "<body>" | bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate <s> --kind <K> --status <S> --title "…"
   ```
   Lead with the dead-ends and mistakes — those are the ones that get skipped. Be terse.
3. **Refresh the NOW-header through the gate.** Pipe the new header (the `## NOW … Open frontier …
   Next actions … RESUME` region) to `kb-now` — it owns the `Updated:` stamp and the exact
   latest-ledger freshness marker, checks the required sections and size, and writes a bounded
   replacement between the `now:` markers:
   ```
   echo "<## NOW … / ## Open frontier … / ## Next actions … / ## <<< RESUME … >>> …>" | \
     bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-now.ts" --note "<short, e.g. the version>"
   ```
   Never hand-type the `Updated:` stamp or a `### [ts]` log line — both are the gate's job.
4. **Keep memory fresh.** Memory is where the session's settled, durable truths live — sweep
   what this session settled or overturned: new facts enter via `kb-add --substrate memory`,
   stale ones flip to `status: retired`. State that would otherwise tempt a Telos edit ("how
   we do X now", the current method or tool) belongs here or in the NOW-header — the Telos is
   **read, never written, at a checkpoint** (its edits are operator-triggered; the `telos`
   skill has the boundary). Reconcile what the session touched; don't re-survey the store.
5. **Drift check (judgment — against the Telos).** Use the complete current `.promptus/TELOS.md`
   already in context, or read it when absent or uncertain — the north star,
   the commitments, and the rules that never bend — and weigh it against this session's recent
   ledger entries and the NOW-header. Ask one question: *is the work still in service of the Telos,
   or has a commitment quietly bent* — scope creep, machinery added without a measured threshold,
   novelty chased over utility, a "never bends" rule contradicted, a stated direction abandoned,
   or a `TELOS.md` edit nobody asked for (Telos edits are operator-triggered)?
   This is judgement, not a script — the one place worth the LLM's eye.
   - **On course** → one line, no noise (`Drift check: on course`).
   - **Drift** → a terse, specific flag: name the tension, the commitment or invariant at stake,
     and what would resolve it. This is for the human steward — surface it at the **top** of the
     report (step 6), not buried. Never invent drift; flag only what the entries actually show.
6. **Health-check and report.** The health gate includes re-indexing; run
   `promptus-check --ratchet` when the project has a recorded debt baseline (otherwise run normal
   `promptus-check` and explicitly report the debt). Then the summary — **lead with the drift verdict
   from step 5** (a flag for the human if the work has wandered, otherwise "on course"), then: N
   added (by kind), anything flagged, and the resume line. Then it's safe to `/compact`.

Re-distilling OLD, already-stored material, chasing contradictions, archiving the log —
that's deliberate tidying, **not** part of the minimal flush. But don't confuse tidying
with step 1's digest duty: a research report that exists only in this conversation is
perishable, and flushing it into a finding unit is exactly what the checkpoint is for.
