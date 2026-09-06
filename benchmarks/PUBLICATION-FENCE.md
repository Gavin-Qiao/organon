# Publication fence: existing-backend correctness slice

Authorized after the operator's “Let's continue” on 2026-09-05. This is a
benchmark-only experiment, not a shipped feature or a database adoption.

## Fixed question and scope

Can a persistent dirty barrier make cooperating fresh processes reconcile an
acknowledged write before reading, using the existing lease, writers, full
collector, index builder, scorer and bounded fetch? Compare with the untouched
baseline. Do not add sparse parsing, SQLite, embeddings, watchers or a daemon.
No live Psi/MoT/Probatio/Mensura access. Use marked synthetic disposable fixtures.

The harness makes an isolated runtime copy and injects narrowly asserted hooks
at the existing lease action and atomic replacement boundaries. Production files
are not edited. Record original and instrumented hashes. Hooks retain source
intent before mutation, mark dirty paths (bounded, overflow becomes ALL), and
acknowledge source completion without claiming index publication. Query/index
operations share the existing lease. Dirty, missing or corrupt derived state
triggers the unchanged full index builder; CLEAN is published last.

All generated runtime writers/readers must participate. Direct production tools
on a fixture bypass this experimental guarantee. The fixture marker is a scope
guard, not a security boundary against a malicious local actor.

## Acceptance checks fixed before execution

- Cross-process append and metadata amendment -> find -> exact get; an append
  changes the former last ledger slice too. Compare source-derived catalog,
  graph, full search JSON and exact query output with ordinary full indexing.
- A new superseding relation updates an unchanged target; deletion of the
  relation restores declared state after explicit reconciliation. Preserve
  exact phrases, required/all terms, history, aliases, status and graph options.
- Throw before intent persistence, after intent, after source temporary write,
  after source rename, before acknowledgement, during each derived replacement,
  and before CLEAN. Never acknowledge a failed operation or serve false CLEAN.
  Inject ENOSPC at write boundaries (not a physically filled filesystem).
- Kill a child after source replacement; verify its stale lease blocks access,
  then clear only that child's exact lease after confirming termination.
- Missing/corrupt control or derived component -> new epoch/full reconstruction;
  failed recovery is an explicit error. Preserve source and the active lease.
- Bound dirty-path growth and preserve batching; no historical operation log.
- Unobserved outside edits, including unchanged size/mtime and an unseen
  superseding file, must not acquire global freshness labels. Exact fetch checks
  the selected source buffer and reports changes; it is not global certification.
- Preserve an untouched baseline arm; compare governed write -> explicit full
  maintenance -> fresh find -> get with fenced write -> fresh find -> get.
  Also measure clean fresh-process navigation separately. The unfenced
  write -> find route is a visibility control, not equivalent certification.

## Measurement and stop rule

Run on the actual Windows-mounted target, reporting its filesystem type; tmpfs
unit tests do not certify persistent storage. Synthetic scale includes a many-unit
ledger and separate page files. Report individual samples, medians, phase time,
lease wait, derived bytes hashed/written, steady bytes and an instrumented
logical-byte peak including replacement temporaries. State uninstrumented reads
and allocations explicitly. No cold OS-page-cache or power-loss claims.

No latency or disk adoption budget is invented. Correctness failure blocks
promotion; passing the slice licenses only its measured scope. Full rebuilding
and component hashing may be slower than existing maintenance. Keep the baseline
unless a separately agreed performance/storage allowance and implementation
review justify integration. Incremental parser factoring and reduced SQL remain
separate next decisions, not unfinished pieces of this consistency experiment.
