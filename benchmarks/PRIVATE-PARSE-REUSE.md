# Private-copy parse reuse trial

Authorized by “Let's go” after the synthetic parse-reuse result. Reuse the verified
September 5 Psi/MoT captures, not live mutable inputs. Do not change prior empirical
artifacts, production code, installed plugins or live project stores.

## Fixed experiment boundary

- Use the existing snapshot verifier and publication/runtime staging helpers.
  Working source and indexes stay in a physical private directory outside the
  repository on the Windows mount. Frozen captures remain unchanged in OS temp.
- Compare the previous fenced full parser and the same raw-cache candidate. A
  staged-only guard refuses a compressed cache above **16 MiB before writing it**.
  This is a trial ceiling, not an approved production resource policy.
- Stop above **256 MiB logical scratch bytes** between phases, above **1 GiB
  sampled subprocess-tree RSS**, or after **60 seconds per subprocess**. RSS and
  scratch sampling cannot guarantee instantaneous hard peaks; cache size has an
  exact pre-write guard. The existing 128 MiB decompression guard is retained.
  Limits bound a two-arm, one-project-at-a-time trial with 16–19 MB source copies;
  remove each generated corpus pair when its evidence has been retained.
- No models, GPU, network, new database, daemon or watcher. Keep private text,
  paths, query strings and raw diagnostics outside the repository. Public output
  uses explicit numeric/boolean/hash allowlists and opaque case ordinals.

## Workload and correctness

Three append and three metadata-amend workflows per arm, alternating order.
Amend only an inserted synthetic finding; never reinterpret a real scientific
claim. Each operation must become visible through a fresh find and exact fetch.
After every workflow, execute ten clean fresh-process queries rotating through
the existing canonical query-case generator (terms, phrase, required/all terms,
status, substrate, history). Preserve original real Markdown outside synthetic
probe paths and the gated ledger append.

The 10:1 workload is a controlled read-heavy scenario, not a recovered session
trace. Also reweight measured clean-query cost to 100 reads/write as sensitivity
analysis, clearly distinguished from an observed 100-read trace. Actual agent
session read/write ratios are unknown; no transcript or new telemetry collection.

Compare raw cached units and catalog/graph/search bytes to a full source-only
oracle **before** any forced candidate rebuild can conceal an incremental bug.
Exercise original real query controls and verify cached output hashes against
the oracle on the same source. Hash frozen inputs before/after. Copy completeness
does not certify external scientific artifacts, thinker custody or live freshness.

Charge complete writer + fresh selection + exact fetch + ten reads, cache
load/save, component hashing and all remaining traversal/projection/index work.
Report per-phase timing, sampled RSS, compressed and derived storage, allocated
steady bytes and a conservative replacement-overlap bound. Retain failing results
without widening limits or altering source data to make the candidate pass.

## Completion boundary

A successful run earns an integration decision, not automatic adoption. Report
both projects and failures, stop-rule outcomes, cold/live scale and capture age.
No install, commit, push, tag, release, live-store repair or backend switch.
