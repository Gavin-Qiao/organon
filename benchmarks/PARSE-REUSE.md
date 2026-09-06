# Raw parse reuse behind the publication fence

Authorized by “Go next” on 2026-09-05. Benchmark-only; no production, installed
plugin or live Psi/MoT/Probatio/Mensura changes. Preserve earlier trial artifacts.

## Question fixed before testing

Does caching unchanged physical-file parser outputs improve the existing fenced
workflow enough to justify its CPU, memory and disk overhead?

Reuse the exact canonical collector's directory traversal, ownership, ordering,
page parser and ledger parser in an isolated runtime copy. Wrap parser calls only
during index construction, not ordinary source inspection or writer validation.
Cache raw units before lifecycle projection and return independent objects to
consumers. Always retain full global resolution and lexical index construction.

One disposable gzip-compressed JSON cache contains parser outputs, including text.
This **does duplicate derived text**, explicitly charged to storage; compression
is not a claim that its cost disappears. Use built-in compression, not a new DB.
The cache joins the existing publication receipt's hashed components. Missing,
corrupt, incompatible or uncertain state falls back to complete source parsing.
Explicit full reconciliation and source-hash certification bypass reuse. Known
dirty physical files are reparsed in full, including a ledger's previous slice.
Directory discovery is deliberately retained so no new ordering/ownership engine
is invented. Unknown outside body edits still cannot receive global freshness.

## Refute-first acceptance

- Compare raw units and byte-exact catalog/graph/search output to full collection
  after append, amendment, content edits, relation removal, new/deleted/renamed
  files, archive movement, nested custom stores and configuration changes.
- Exercise order-sensitive custom lifecycle transitions, alias collisions,
  stable and legacy identities, fenced fake headers and CRLF source text.
- Prove raw cached status is not mutated by projection: removing a superseding
  relation must restore the declared target status.
- Exercise cache loss/corruption, interruption before/after cache replacement,
  failed final publication, dirty-map overflow, and repeated writes before read.
- Retain exact phrase/required/all-term, status, history and graph query parity.
- Count parsed/reused files and units, actual parser source bytes, directory
  discovery, compression/load/save time and cache bytes. Charge all remaining
  full-resolution/tokenization/serialization work in end-to-end timings.

## Measurement and stop rule

Compare the previous fenced full-parser baseline to the reuse candidate on fresh
synthetic fixtures on the actual Windows-mounted filesystem. Alternate arms for
repeated append and amendment traces; measure clean navigation separately.
Reuse the prior 512-page/4096-ledger-unit scale, and add less-compressible synthetic
text to expose compression sensitivity. Report individual samples and complete
steady/logical-peak space including cache replacement, not query kernels alone.
No GPU, semantic bakeoff or private project source is needed for this question.

Passing proves only tested synthetic scope. No production promotion without a
chosen resource allowance and integration review. Retain the baseline if parity
fails or the complete workflow does not justify its storage/complexity cost.
Do not infer constant-time writes, eliminated discovery or general outside-edit
freshness from fewer parser calls.
