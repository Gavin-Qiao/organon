---
description: Minimal pre-compaction flush — sweep the session for anything not yet stored and add it through kb-add, refresh the NOW-header, re-index, and run a short drift check against the Telos. Doesn't rebuild the wheel; the research-ledger skill owns the format.
argument-hint: "[optional scope note]"
---

# /checkpoint — minimal flush before compaction

Goal: lose nothing to the compaction. This is a thin **check-and-add**, not a re-run of the
whole methodology — the `research-ledger` skill owns the format (kinds, status tags, the
NOW-header); load it if you need the spec. Work from facts; never invent entries.

1. **Check.** Sweep the session for anything that exists only in the conversation, not yet in
   a store — decisions, runs, observations, dead-ends, fixes, findings, prior art read.
2. **Add** each through the gate (the script owns the timestamp / id / placement):
   ```
   echo "<body>" | bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate <s> --kind <K> --status <S> --title "…"
   ```
   Lead with the dead-ends and mistakes — those are the ones that get skipped. Be terse.
3. **Refresh the NOW-header through the gate.** Pipe the new header (the `## NOW … Open frontier …
   Next actions … RESUME` region) to `kb-now` — it owns the `Updated:` stamp (from the clock, never
   hand-typed), checks the required sections, and writes a bounded replacement between the `now:`
   markers:
   ```
   echo "<## NOW … / ## Open frontier … / ## Next actions … / ## <<< RESUME … >>> …>" | \
     bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-now.ts" --note "<short, e.g. the version>"
   ```
   Never hand-type the `Updated:` stamp or a `### [ts]` log line — both are the gate's job.
4. **Reconcile memory** only where the session clearly settled or overturned a fact
   (`kb-add --substrate memory`, or flip a stale one to `status: retired`). Don't re-survey.
5. **Drift check (judgment — against the Telos).** Read `.promptus/TELOS.md` — the north star,
   the commitments, and the rules that never bend — and weigh it against this session's recent
   ledger entries and the NOW-header. Ask one question: *is the work still in service of the Telos,
   or has a commitment quietly bent* — scope creep, machinery added without a measured threshold,
   novelty chased over utility, a "never bends" rule contradicted, a stated direction abandoned?
   This is judgement, not a script — the one place worth the LLM's eye.
   - **On course** → one line, no noise (`Drift check: on course`).
   - **Drift** → a terse, specific flag: name the tension, the commitment or invariant at stake,
     and what would resolve it. This is for the human steward — surface it at the **top** of the
     report (step 6), not buried. Never invent drift; flag only what the entries actually show.
6. **Re-index + report.** `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts"` to refresh the
   catalog and surface orphans / unresolved links. Then the summary — **lead with the drift verdict
   from step 5** (a flag for the human if the work has wandered, otherwise "on course"), then: N
   added (by kind), anything flagged, and the resume line. Then it's safe to `/compact`.

Distilling findings into `docs/`, chasing contradictions, archiving the log — that's deliberate
tidying, **not** part of the minimal flush. Do it when you have the room, not as a reflex.
