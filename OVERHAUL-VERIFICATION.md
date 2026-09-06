# Candidate completion audit

This audit covers the requested end-to-end source candidate, not a release, installation,
claim of universal model improvement, or migration of live research projects. Read it with
[the scope](OVERHAUL.md), [retrieval decision](RETRIEVAL.md) and [migration guide](MIGRATION.md).

| Requirement | Evidence and verified result |
| --- | --- |
| Baseline and inventory | OVERHAUL records the original 370-test baseline, current command/skill/script inventory and unchanged release boundary. Independent entrypoint and specialized instruction audits inspected both plugins, their workflow adapters, hooks and relevant references. Concrete conflicts were corrected, not hidden by renaming scope. |
| Established retrieval alternatives | Frozen public-development and fresh synthetic suites compare lexical, FTS5, QMD and zvec-grep with pinned configurations, repeated queries, build/update/delete, fresh-process and 500/5,000-unit measurements. RETRIEVAL preserves ranking versus recall, resource/startup costs, failed runs and zvec variability. QMD is optional; FTS/default replacement and a second vector adapter were ruled out by this comparative evidence. |
| Retrieval implementation | `semantic.test.ts` covers identity/lifecycle, exact controls, fresh fallback, filtering/graph, archives, races, unsafe links, corruption and models. The corrected 14-step actual-SDK receipt verifies offline sandbox execution, actual edited content with embedding rows, lifecycle, archive/delete and restarted CLI behavior. Default lookup has no external dependency. |
| Store and maintenance | `concurrency.test.ts` preserves 24 concurrent events and 12 independent aliases, and kills a specifically spawned synthetic writer to verify fail-closed lease recovery with unchanged source. The batch receipt compares six complete write-to-resume flows: every event retained, exact health/artifact checks, 2.408 s versus 1.055 s median. |
| Agent instructions | Root policy, template/router/recall/recording/checkpoint/preflight/init/ingest, grounded reviewer, Editio entrypoint and LaTeX reference corrections preserve authority, body-first evidence and task scope. Fresh packet, manuscript, semantic-recall and interrupted-work pilots exercise real use. They are limited pilots, not statistical proof that GPT-6 always behaves better. |
| Continuity under failure | The interrupted-work fixture omits authentic raw evidence and has only an incomplete job checkpoint. A fresh GPT-6 agent writes a readiness note and one OPEN handoff without rerunning or inventing work. Independent verification preserves old bodies and proves freshness can pass while the artifact gate correctly remains red. Earlier fresh tasks cover changed decisions, absence and stale cache. |
| Research-to-manuscript | Canonical stable IDs/aliases, effective and archived lifecycle, historical reporting and existing number/publish gates are tested. The operational manuscript retest passes without overrides and preserves evidence. The standalone preview compiles real TeX with shared values/macros/identity. Existing venue/render/identity/number/doctor regressions remain in the full suite. |
| Packaging and migration | Both adapters validate and checked reader copies match. `packaging.test.ts` executes temporary plugin copies, out-of-project roots, missing-QMD fallback, standalone Editio without sibling Promptus, and legacy dry-run/exact-byte migration/idempotence. MIGRATION documents compatible adoption, historical syntax, explicit batch maintenance and rollback. |
| Final source integrity | Run the complete test suite, plugin validation, skill validation, changelog checks, whitespace/diff checks, strict Promptus health and read-only artifact preflight. The final ledger event/NOW supplies the exact tally and current artifact custody; original receipts remain immutable. |

## Evidence limits and release boundary

The tests are synthetic or public-repository based. No current Psi, MoT, Probatio or Mensura
store was read or changed. Neither live-project performance nor causal model improvement is
claimed. No search engine decides truth, entailment or definitive absence. Exact source and
artifact verification remain authoritative.

QMD tests use the staged local SDK/model on Linux CPU. Other operating systems and actual
desktop hook delivery require their normal host validation; source adapter tests do not certify
them. The preview compile is an authoring-proxy check, not proof of every venue's PDF policy.
No global model/runtime setup, remote transmission, resident server or installed-cache update
is part of this candidate. Historical model generations and failed scratch receipts are not
silently purged or reclassified as successes.

Landing and release remain separate operator decisions. The candidate does not bump versions,
commit, push, tag or install itself. Release requires the established merged-PR boundary.

Six immutable engine receipts exceed the default 500 KiB added-file cap (largest 5.8 MB).
The hygiene configuration exempts only those exact dated public/synthetic receipt filenames;
their source hashes remain recorded, and other new files retain the cap. No model, dependency
tree or private corpus is vendored. Original receipts were not truncated to satisfy a size check.
