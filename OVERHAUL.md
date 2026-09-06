# Organon overhaul

Status: implemented source candidate; completion evidence in [OVERHAUL-VERIFICATION.md](OVERHAUL-VERIFICATION.md).
Requested by Mohan on 2026-09-04. Not committed, released or installed.

## Outcome

Overhaul Organon end to end for long-running research with GPT-6 and other capable
agents: reliable external memory, efficient repeated retrieval, low-friction
evidence recording, and grounded manuscript production. Reconsider existing
choices against zvec-grep, QMD, and established embedded search rather than
assuming either the current implementation or a new framework must win.

The deliverable is a tested, documented, migration-ready candidate across both
Promptus and Editio. A research report or a shorter AGENTS.md alone is not
completion. Publication and installation retain the release PR boundary.

## Constraints

- Project Markdown and original evidence remain authoritative and portable.
- Stable IDs, epistemic status, lifecycle transitions, source/artifact provenance,
  and bounded retrieval survive backend changes.
- Benchmark corpora are synthetic, this public repository, or already authorized
  immutable fixtures. Do not read or write the live Psi, MoT, Probatio, or Mensura
  stores during this overhaul.
- Prototype dependencies, models, databases, and generated fixtures live in
  declared isolated scratch locations. No global plugin or tool installation.
- Keep the existing cleanup receipt; do not rewrite historical log entries.
- New database/embedding machinery requires measured benefit. A search backend
  is disposable derived state, never the authority for health or claim validity.

## Work and completion evidence

| Area | Required result | Evidence needed | State |
| --- | --- | --- | --- |
| Baseline | Inventory current commands, skills, hooks, adapters, contracts, release state, and tests | Source inventory, baseline run, concrete conflicts | Verified: source inventory and both entrypoint/specialized audits |
| Retrieval selection | Compare zvec-grep, QMD, embedded FTS, and existing lexical retrieval under the actual workload | Pinned versions; repeated-query, build, delta, cold-start, resource and relevance receipts | Candidate selected: lexical default plus optional QMD vectors; rationale and limits in RETRIEVAL.md |
| Retrieval implementation | Adopt measured winner with unit identity, lifecycle, exact controls, provenance, and deterministic fallback | Integration and stale/edit/delete/rebuild tests; no hidden network or live-store access | Verified candidate: 14-step real SDK mutation/restart trial, contract regressions and fresh GPT-6 recall |
| Store and maintenance | Reduce foreground bookkeeping without losing events, NOW freshness, concurrency, or exact checks | Write-to-resume workflow tests and timing; failure recovery | Verified: serialization, alias concurrency, terminated-writer recovery, six measured batch flows |
| Agent instructions | Precise skill discovery, conditional workflows, one current policy authority, task-proportional verification and completion | Both plugin instruction audit; routing cases; controlled agent trials | Verified candidate: entrypoint/specialized audit corrections, validators and bounded fresh GPT-6 pilots |
| Session continuity | Resume and act correctly after a fresh start, changed decision, missing evidence, and interrupted work | Controlled fresh-agent responses and provenance, separate from deterministic harness results | Verified in bounded pilots: packet, manuscript, semantic/stale-cache and missing-artifact/interrupted-work tasks |
| Editio | Audit and improve research-to-manuscript handoff, claim/number/identity grounding, rendering and diagnostics | Isolated paper fixture; existing and changed behavioral gates; accurate supported capability descriptions | Verified candidate: canonical/archived grounding, manuscript retest, standalone gates and real section-preview compile |
| Packaging and migration | Consistent Claude/Codex adapters, docs, templates, compatibility and rollback | Plugin validation; temporary install/package inspection; disposable old-store migration tests | Local package/migration tests pass; MIGRATION.md covers compatibility/rollback. Actual host delivery and other OS execution are not certified here |
| Final verification | Full scope above is implemented or ruled out by explicit comparative evidence | Final tests, health, benchmark receipts, requirement-by-requirement audit | 409 tests pass; completion audit and final ledger custody record exact gates and limitations |

## Initial evidence

- Session preflight: 332 units, 110 source files, READY with no errors; inherited
  graph and archival-artifact warnings remain.
- The ledger's static guardrails prohibit agent co-authorship, contradicting the
  current repository contract. Historical policy must not masquerade as current
  operating instructions.
- SessionStart injects the full Telos and NOW. AGENTS.md independently requires
  reading Telos again and repeats the plugin map. Measure and remove redundant
  context without concealing direction or current state.
- Existing continuity coverage is eight deterministic cases; fresh-agent
  behavior remains unmeasured.
- Existing SQLite shadow results show different tradeoffs for fresh-process
  queries, persistent queries, build cost and writer-known deltas. They justify
  a workload-specific comparison, not an unconditional SQLite rejection.
- Existing dense retrieval improves semantic recall but loses exact lexical
  controls when used as a replacement. Evaluate a lifecycle-aware mixed route.

## First candidate evidence

- Full baseline: 370 tests / 2,018 expectations. The first candidate passed 379 tests /
  2,086 expectations and both plugin adapters validated. No release or installed cache changed.
- [CPU engine comparison](benchmarks/results/engines-development-semantic-retry-2026-09-04.json):
  42 currently usable historical development cases, three repeated passes. Lexical found 31
  expected results in the top ten; the frozen five-per-route union found 34 with zvec-grep and
  35 with QMD vectors. Neither backend is selected: independent cases, cold starts, larger
  synthetic scale, refresh/delete behavior and integration cost remain unmeasured here.
- [Fresh GPT-6 packet replay](benchmarks/results/gpt6-continuity-replay-2026-09-04.json):
  one fresh context per arm, same seven answerable packets, baseline versus shorter recall
  instructions. Both chose every answer correctly and abstained appropriately. The strict
  evidence-list scores were 6/7 and 7/7; the baseline also listed a superseded unit while
  recognizing it as historical. This small, unreplicated pilot does not establish a causal
  improvement or autonomous tool-use/continuation quality.
- Metadata amendments now share the source-writer lease, replace atomically, reject symlink
  targets and ambiguous aliases, and preserve bodies. Concurrent additions of twelve aliases
  pass without loss. An accidental truncated source handle in the new plan was repaired by
  adding a compatibility alias to its target through the gate, not rewriting ledger history.
- [Operational GPT-6 manuscript trial](benchmarks/results/gpt6-manuscript-continuation-2026-09-04.json):
  the agent retrieved synthetic evidence, finished an Evaluation section, bound three numbers,
  rendered LaTeX, and ran the gates. The source store hash stayed identical. Numbers passed;
  claims failed because an accurate historical rejection cites a `REFUTED` event. The agent
  also had to replace stable IDs with slugs. Independent inspection confirmed all eight
  fixture stable IDs are missing from Editio's resolver and its raw parser still treats a
  relation-superseded finding as `VALIDATED`. This is a concrete grounding-contract defect,
  not a reason to weaken gates or rewrite evidence.

## Sources being evaluated

- [GPT-6 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)
- [Provencher on GPT-6 skills and prompts](https://x.com/pvncher/status/2095991462416490862)
- [zvec-grep](https://github.com/zvec-ai/zvec-grep): integrated exact, lexical and
  semantic workspace retrieval; inspect direct execution and incremental indexing.
- [zvec](https://github.com/alibaba/zvec): embedded vector engine beneath zvec-grep;
  evaluate direct integration only if the higher-level product cannot preserve
  Promptus unit semantics with a small adapter.
- [QMD](https://github.com/tobi/qmd): local Markdown search with lexical, vector and
  reranking routes; inspect its SDK, update cost and optional model requirements.
- [SQLite FTS5](https://www.sqlite.org/fts5.html): embedded lexical baseline available
  through Bun; does not itself supply semantic retrieval.

Framework documentation is capability evidence, not comparative performance
evidence. Published vendor benchmarks do not prove outcomes for Promptus.

## Execution order

Establish the baseline and freeze comparison cases. Evaluate retrieval candidates
while identifying instruction and workflow defects. Implement the selected
architecture and complete the instruction, maintenance, Editio, and packaging
work. Run controlled continuity and end-to-end paper fixtures, then perform the
full completion audit. Keep this scope intact across resumptions.

The exposed grounding boundary is now addressed by one canonical parser with checked packaged
copies and an explicit historical grade. The [fresh operational retest](benchmarks/results/gpt6-manuscript-grounding-retest-2026-09-04.json)
passes claim and number gates without overrides, preserving source bytes. Seven regressions and
the full 386-test suite pass; plugin validation includes copy parity. A 341-unit reindex changed
zero derived files after extracting the reader. The original failed receipt remains intact.

Retrieval selection now has fresh synthetic cases, 500/5,000-unit runs, fresh-process timing,
incremental edit/add/delete checks and an independent GPT-6 harness audit. The audit exposed a
weak same-ID edit assertion; the strengthened 500-unit rerun verifies actual indexed content
and input provenance. Original receipts remain intact. [RETRIEVAL.md](RETRIEVAL.md) records the
candidate choice: retain default lexical retrieval and add an optional local QMD vector route,
without implicit installation or downloads. QMD's first-result advantage is measured on the
fresh cases; mixed-route recall improvement remains development evidence, not fresh validation.

The adapter is now implemented: explicit local configuration, canonical-unit projections,
source/model/database receipts, exact URI binding, lifecycle-filtered candidates and diagnostic
fresh lexical fallback. Thirteen contract regressions cover stale/racing source, exact controls,
status/graph filtering, archives/deletion/restart, model replacement, corrupted receipts/databases,
SQLite sidecars, symlinks and hardlinks. These use an SDK double; real pinned SDK trials separately
verify ordinary-sandbox setup, retrieval, status filters, unchanged refresh, a gated source addition,
stale fallback and successful retrieval after refreshing and restarting the CLI.

The expanded real-SDK trial now verifies same-ID body replacement with actual stored content
and embedding-row checks, gated refutation, archive movement, deletion and fresh CLI processes.
It exposed two failures: a measurement reader created SQLite sidecars, and removing an empty
QMD collection left active document rows. Measurement now uses a disposable database copy;
the adapter scans emptied collections before removing their configuration. Original failed
receipts remain. The corrected 14-step trial passes.

A fresh GPT-6 recall task recovered current versus superseded evidence, identified fictional
alarm provenance, and reported stale cached state without repairing it. Its ten source files
remain byte-identical; concurrency-induced semantic fallback was explicit. This is one pilot,
not a statistical behavior claim.

The instruction-contract audit covered both entrypoints, resume/init/checkpoint adapters,
hooks and manuscript gates. It found existing-AGENTS overwrite risk, blanket preflight stops,
checkpoint/archive conflict, unconditional paper creation/PDF builds and wrong-root hook indexing.
These are corrected. The hook was removed in favor of explicit batch maintenance; no host
shell-payload normalization is assumed. Remaining specialized-skill and final scope audit stays open.

## Current source inventory

Promptus has 10 command adapters, 15 skills and 21 top-level TypeScript script files (including
maintenance/release helpers). Editio has one command adapter, six skills and nine top-level
TypeScript files (including two helpers). Both hosts use the same script implementations and
separate manifests; Editio carries eight checked canonical-reader files. Promptus now has three
hooks per host: session start, source protection and checkpoint prompting. Native desktop hook
delivery is not proved by source validation. Local HEAD remains the pre-overhaul docs commit
dfbbbc1; plugin manifests/tags remain unchanged, and all overhaul work is an uncommitted candidate.

The final fresh-agent task completes a readiness note and OPEN handoff while leaving missing
evidence red; independent verification preserves every old body and confirms no fabricated output.
A terminated synthetic writer test proves source preservation and explicit lease recovery. Six
batch-flow runs retain every event and pass exact health/artifact preflight, with median latency
2.408 s per-write indexing versus 1.055 s batch maintenance. Specialized review also corrected
manual provenance instructions, header-only grounding and missing section-preview dependencies;
the preview now compiles with real TeX. The full suite passes 409 tests / 2284 expectations.

The source candidate now satisfies the matrix with the limits stated in
[OVERHAUL-VERIFICATION.md](OVERHAUL-VERIFICATION.md). Release, installation and live-project
rollout are separate decisions, not unfinished authorized mutations.
