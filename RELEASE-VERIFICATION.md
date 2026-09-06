# Release integration verification

Source integration is implemented; this is not a release or four-project rollout receipt.
The implementation follows [RELEASE-PLAN.md](RELEASE-PLAN.md) and extends the earlier
candidate without claiming that historical results certify new bytes.

## Required areas

| Area | Implementation and verification |
| --- | --- |
| Skills and grounding | Existing canonical-grounding/continuation/packaging tests remain. The Promptus routing skill gains three narrow entries for the new tools, not a new mandatory workflow. Editio's checked reader remains source-only. |
| Runtime | Optional per-file raw parses use exact byte hashes and parser identity, preserve ownership/order, and clone before global status projection. Cache-free phrase verification maps ledger slices once per process. Index publication has a completion receipt; readers validate the component buffers they actually consume or fall back to current source. Source writers/indexers share the existing lease. |
| Upgrades | `promptus-upgrade` previews exact targets, explicit package/version fingerprints, source/policy/limit-bound tokens and diagnostics. Token-bound apply refreshes derived state, runs strict health and read-only postflight, and reports partial failure. Fixture tests preserve custom policy/source and cover repeated application, changed plans, wrong roots and absent evidence. Host installation and live session reload remain external, explicit steps. |
| Diagnostics | Session-doctor issues carry codes, surfaces, paths and recovery advice. Evidence, identity, handoff, derived-cache and optional-runtime failures remain distinct. JSON tool/precondition failure is also structured. No diagnostic performs a repair. |
| Resources | `kb-cache` previews logical cache use, configured allowance, point-in-time free space and replacement scratch. Optional raw writes refuse compressed/decode quota and space violations; an optional-cache write failure retains canonical indexing. Eviction targets only the named raw file under the writer lease and refuses indirection. Tests exercise quota/space policy, optional write failure, contention and source preservation. `kb-semantic preview` explicitly reports unknown third-party growth: this release does not provide a QMD filesystem quota or whole-process memory cap. |
| Evidence navigation | `kb-evidence` reads canonical source and provides bounded cards/bodies, typed incoming/outgoing relations, effective status, provenance and artifact checks. Tests cover support of superseded/refuted evidence, missing artifacts, unknown/ambiguous IDs, explicit OPEN records and body limits. It does not infer scientific truth or add annotations. |

## Performance decision

Persistent raw caching is **off by default**. The production implementation performs exact
source-byte verification rather than trusting the experiment's governed dirty-path assumption.
The bounded acceptance fixture (512 pages and 1,024 ledger entries, three alternating updates
per arm on OS-temp storage) preserved byte-exact catalog/search/graph and query parity, but
did not earn default activation. Median cache-disabled/enabled index times were approximately
139/202 ms; phrase retrieval 83/112 ms. Exact updated source fetches passed in both arms.

These numbers compare cache-disabled/enabled modes of this production candidate, not the
released plugin or live research sessions. They do not establish a speedup from the new
cache-free slice map. Prior frozen Psi/MoT maintenance gains remain valid for that experimental
implementation, not a promise about this different integration. Users can explicitly opt in
with `PROMPTUS_PARSE_CACHE_BYTES`; no research project acquires a new persistent raw cache
merely by upgrading.

The [initial acceptance receipt](benchmarks/results/release-runtime-acceptance-2026-09-05.json)
and [final acceptance receipt](benchmarks/results/release-runtime-acceptance-final-2026-09-05.json)
retain their exact source hashes. No new model/backend or private-corpus experiment was run.

## Failures and evidence custody

The first full suite exposed old benchmark instrumentation that assumed no production cache
or index lease. Its disposable runtime adapter now explicitly reconstructs the earlier
experimental boundary. A historical negative control changed because production retrieval
now detects incomplete publication; its current regression expects the corrected behavior.
Original harness/test bytes are preserved under `benchmarks/history/pre-release-integration/`.
The original benchmark receipts are unchanged. Successor custody records retain historical
claims and redirect historical harness dependencies to those byte-identical archived copies;
they do not replace old measurements with the current implementation.

## Delivery boundary

Local Linux execution and packaged-reader/adapter validation are required here. Native
Windows/macOS CI, merged release PRs, tags, publication, host installation, session reloads
and per-project adoption receipts are not certified by this checkout run. Live Psi, MoT,
Probatio and Mensura remain untouched. No manifest bump is made before the release-cut PR.
No inherited graph/archival warning is erased or baselined as part of implementation.

The final gated ledger result records exact test totals and current source-artifact hashes;
use that result rather than treating earlier stage counts as the final gate.
