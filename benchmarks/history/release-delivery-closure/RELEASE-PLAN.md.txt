# Organon release integration plan

Status: source implementation completed on 2026-09-05; local verification is recorded in
[RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md) and the final ledger result. External
release and adoption gates remain open. This is the current release frontier, extending
the completed source-candidate scope in [OVERHAUL.md](OVERHAUL.md), not rewriting
its historical completion evidence.

## Goal

Deliver a tested, documented Organon update that combines improved agent skills,
runtime efficiency and canonical research-to-manuscript grounding with reliable
multi-project upgrades, actionable diagnostics, predictable resource use, and
evidence navigation. Prepare a verifiable rollout to Psi, MoT, Probatio and
Mensura without changing their scientific knowledge or replacing custom policy.

All four added areas are required release work, not optional future suggestions.
Reuse existing capabilities wherever they meet the criteria; extend them only
where a concrete gap remains. Adding a new command for every area is not required.

## Starting boundary

Implementation decision: persistent raw caching is opt-in (default allowance 0), because
production acceptance preserved parity but showed overhead. The cache-free read path and
batch cadence remain available without an extra stored index. Optional QMD growth is reported
as uncapped rather than disguised as covered by the raw-cache quota; low-disk projects retain
lexical retrieval. See RELEASE-VERIFICATION.md for exact scope and limitations.

- The earlier skills, maintenance, semantic-adapter and Editio grounding candidate
  is uncommitted and unreleased. Its recorded verification remains scoped to those
  bytes; the expanded scope below is not yet certified.
- Parse reuse is benchmark-only. Frozen Psi/MoT copies showed lower write-to-fetch
  latency but no ordinary-read improvement; phrase verification from cached text
  is a proposed integration, not a demonstrated retrieval speedup.
- Keep lexical retrieval as the default. No new backend/model comparison, mandatory
  GPU, database, embedding model, or second stored text index is in this plan.
- Preserve previous findings, benchmark receipts and sealed thinker artifacts.
  Do not edit historical evidence to make new source changes look verified.

## Required work and acceptance criteria

| Area | Bounded deliverable | Completion gate |
| --- | --- | --- |
| Skills and grounding | Retain the shorter, conditional workflows and canonical identity/lifecycle interpretation shared by Promptus and Editio. | Existing continuation, status, provenance, historical-grounding and package-parity regressions pass; instructions describe actual behavior. |
| Runtime integration | Integrate changed-file parse reuse and phrase verification using the same cached text; avoid unnecessary work on ordinary reads without weakening the verification contract. | Canonical matching/ranking and exact selected-source fetch remain equivalent; stale/corrupt cache, external edits, interrupted publication and concurrent readers/writers have tested safe behavior. Record a bounded before/after acceptance check using existing fixtures, not a new research trial. |
| Reliable upgrades across projects | Provide a small preview-first upgrade workflow using existing preflight, packaging and maintenance primitives. Identify source/installed versions and explicit project targets, preserve custom instructions, and separate preview from authorized application. | Disposable-project tests prove preview is read-only, repeated application is safe, partial failure is visible, unrelated files remain unchanged and rollback instructions are usable. Actual rollout requires per-project receipts, not a global success claim. |
| Actionable diagnostics | Give stable issue codes, affected paths/surfaces, and the smallest safe recovery action. Distinguish missing/stale derived state, unavailable optional tools, ambiguous identities and missing scientific evidence. | Tests cover each category and machine-readable output; diagnostics neither silently mutate state nor suggest that rebuilding an index repairs absent evidence. A scoped failure must not block unrelated authorized work. |
| Predictable resource use | Expose current cache usage and estimated/upper-bounded additional space before enabling optional acceleration. Apply documented configurable limits and safe derived-cache eviction/fallback; keep CPU-only operation and explicit downloads. | Quota, insufficient-space, interrupted replacement and concurrent-cache-use tests preserve source and keep recovery possible. Account for replacement scratch and distinguish estimates from guarantees. No implicit model downloads or removal of source, evidence, user-owned models or in-use caches. |
| Evidence navigation | Make support, replacement and unresolved-work navigation straightforward through existing stable IDs, typed relations and bounded find/get/graph/status surfaces. Return source locations, status and provenance. | Fixtures cover current versus superseded/refuted support, unknown IDs, missing evidence and explicit unresolved work. Fetch supporting bodies before assertions; never infer that an absent relation proves absence of evidence. No new ontology, automatic truth judgment or mandatory annotation scheme. |

## Execution order

1. Map each acceptance criterion to existing code/tests and list only concrete gaps.
   Reuse completed work; do not restart the overhaul or its research comparisons.
2. Integrate runtime reuse together with resource limits and recovery diagnostics;
   these share the freshness, publication and fallback boundaries.
3. Finish bounded evidence navigation and its canonical-grounding regressions.
4. Finish the preview-first upgrade workflow on disposable project fixtures,
   including custom-policy preservation, interruption and rollback coverage.
5. Update affected READMEs, commands, templates, migration guidance and changelogs.
   Run affected tests during implementation, then repository/adapters/health/package
   gates and the required cross-OS CI checks. Advance source-artifact custody through
   successor records where necessary; preserve historical receipts and warnings.
6. Once landing is authorized, land validated implementation on main under the
   contributor workflow. Prepare each affected plugin's version/changelog release
   PR, merge after required checks/review, and tag only the exact merged commit.
   Verify the publishing workflow. Versions remain separate per plugin.
7. Once installation and live-project scope are authorized, verify exact local
   targets and roll out sequentially: Psi, MoT, Probatio, then Mensura. For each,
   establish a read-only preflight and recoverable snapshot, verify the selected
   installed version, apply only scoped policy/derived-state changes, and run
   retrieval and continuation smoke checks. Stop that project's rollout on failure;
   report it rather than silently repairing evidence or overwriting instructions.

## Authority and finish lines

The operator's subsequent "Let's implement that" authorizes source implementation,
tests and affected documentation. It does not itself authorize a commit, push,
release, installation, live-project mutation, or broad repair. External delivery
retains repository policy and its separate scope. No live project is inspected or
changed by this implementation. Existing Markdown requires no overhaul-specific
source migration; legacy layout migration remains a separately scoped operation.

The source candidate is complete only when every required row has implementation,
relevant tests and truthful documentation. Release completion additionally needs
the merged-commit tags and verified release records. Adoption completion additionally
needs an installed-version and preflight/continuation result for each of the four
projects; a shared plugin update alone does not certify all projects or reload
already-running sessions. Do not report the expanded update complete merely because
the earlier candidate passed its tests.

See [RELEASING.md](RELEASING.md), [MIGRATION.md](MIGRATION.md), and the bounded
[private-copy result](benchmarks/PRIVATE-PARSE-RESULTS.md). The latter supports
maintenance gains only, not an unconditional frequent-retrieval speedup.
