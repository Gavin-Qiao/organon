# Validation plan — What minimal reuse-based change improves a large Markdown research wiki without rebuilding its working core?

**Round:** `markdown-io-delta-design`  
**Status:** `FROZEN_BEFORE_RESPONSE`

This plan stays project-side. Freeze it with the outbound prompt and do not edit it after
preparation. Put checks invented after seeing the response in the synthesis finding, clearly
labelled `POST_RESPONSE`.

## Target and stop rule

Assess the smallest reuse-based change to the existing Markdown-authoritative system. A useful
answer supplies a coherent freshness/recovery mechanism, identifies reuse and defines one
discriminating adoption test; an impossibility argument with a minimal explicit tradeoff is useful.

Reject any route that silently weakens evidence checks, requires a new authority/schema without
a compatibility argument, depends on GPU/network/Obsidian being available, hides full-store work,
or repeats implemented components without a demonstrated gap. Retain the baseline when proposed
benefit is unmeasured or insufficient for its storage/operational cost. No numeric budget is supplied.

## Premise audit

- Recheck canonical reader, writers, lease and per-file rename, lexical query/fetch, full index,
  health and optional semantic source before implementing anything. Source candidate exists but
  remains uncommitted/unreleased/uninstalled. Per-file atomic replacement is not a multi-file
  transaction or certified power-loss durability.
- Verify catalog-bound ordinary lookup versus source-checked semantic fallback/preflight.
  Preserve the distinction between cooperating writers and outside editors.
- Original implementation evidence: OVERHAUL.md, OVERHAUL-VERIFICATION.md and RETRIEVAL.md;
  later findings qualify the original synthetic QMD recommendation without rewriting it.
- Numeric receipts: benchmarks/results/local-cpu-replay-2026-09-05.json and
  benchmarks/results/private-retrieval-quality-2026-09-05.json. Size comparison uses the retained
  post-trial Psi/MoT files; SQL is a broad shadow, not minimal FTS. Timings used tmpfs.
- Source reference capabilities: official Obsidian Vault/storage docs, Omnisearch/MiniSearch
  repositories, Basic Memory local guide, QMD repository and SQLite FTS5 documentation. Verify
  current APIs, licenses, packaging and measured fit independently before adoption.
- The outbound prompt contains no private scientific text, queries, rankings or local source
  paths. Project names and aggregate measurements are sufficient.

## Refute-first checks

1. Map each proposal to the existing inventory. “Add IDs, a canonical parser, locks, batching or
   semantic fallback” is duplicated work unless a missing mechanism and minimal delta are named.
2. Modify an unqueried source outside the lease, optionally preserving size/mtime and losing
   notifications. Add a best matching unit or a superseding relation. A design that reads only
   returned candidates cannot certify globally current recall or lifecycle from that check alone.
3. Change a result between search and fetch; separately change a distant lifecycle dependency.
   Require retry, a verified snapshot or explicitly limited semantics. A returned-body hash alone
   does not prove effective status, nor does a generation counter detect every outside edit.
4. Append then query from a second CLI process. Include the ledger predecessor whose source slice
   changes at insertion, metadata changes, rename, deletion, cold movement and alias collision.
   Expose any disguised full-store scan or whole-ledger reindex in the incremental path.
5. Stop at every source/index publication boundary: temp write, rename, source update, index
   mutation, receipt publication and cleanup. Consider stale leases, partial multi-file updates,
   missing sidecars, corrupt receipts, disk-full and failed cleanup. File and DB atomic operations
   do not jointly establish an atomic transaction across both domains.
6. Two tools modify the same old body while only one honors the lease. Check lost-update/conflict
   guarantees and whether any claimed compare-and-swap is actually enforced across actors.
7. Reuse exact phrase/required/all-term, status/substrate, history, stable-ID/legacy and graph tests.
   Separate intended ranking changes from exact-control regressions; new library scores are not
   assumed identical to custom lexical scores. Relevance improvements require measured evidence.
8. Lose or corrupt disposable cache state in a synthetic fixture. Rebuild must preserve Markdown
   and restore declared semantics or report a failure. Do not silently weaken whole-store health.
9. Charge traversal, parsing, hashing, dependency discovery, model/process startup, serialization,
   index updates and artifact checking. Compare cold/warm reads, single writes, batches, outside
   edits and restart/rebuild, rather than timing only the kernel.
10. Count duplicated text/metadata, postings, projections, models/vectors, journals, generations,
    temporary copies and all projects. Require retention and peak-space reasoning. “Contentless,”
    “compressed” or “incremental” is not by itself a storage bound.
11. Verify reference fit: an app-only API is not headless; an in-memory library can impose startup
    deserialization; watchers need reconciliation; database substitution cannot by itself remove
    full canonical scans. Inspect license/dependency compatibility before copying/adopting code.
12. Keep the QMD timeout and synthetic successes scoped, and the zvec pilot model-labelled and
    small. Follow-up efficacy tests need fresh cases or explicit development-case reuse. Do not
    treat candidate usefulness as scientific truth, complete multi-source recall or absence proof.

## Claim adjudication

For every returned claim, record one disposition:

- `VALIDATED`: independently reconstructed from project evidence;
- `REFUTED`: an explicit counterexample or failed necessary check exists;
- `UNRESOLVED`: neither proved nor refuted;
- `OUT_OF_SCOPE`: not licensed by the sealed question.

The raw response remains `lit:UNTRUSTED` under every disposition. Accepted claims become separate
findings linked with `derives-from`.

## Authorization boundary

This round independently authorizes none of: implementation, protected source or outcome access,
experiments, publication, venue selection, commit, push, tag, or release.

The checks above are prospective acceptance checks, not authority to run new experiments now.
Preserve the exact returned attachment or inline response before interpretation through the
thinker receive gate. Any new checks invented after intake must be labelled POST_RESPONSE.
