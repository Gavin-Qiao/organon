# AGENTS.md — <PROJECT NAME>

> Template cadence for a Promptus-managed project. `/promptus-init` drops this in.

## Cadence

Resolve `<plugin-root>` from the loaded Promptus skill or command; it is the absolute plugin
directory, not a presumed shell environment variable.

1. **Hold `.promptus/TELOS.md` first** — the direction and the rules that never bend.
   Reuse a complete current hook-injected copy; read the file if absent, changed, or uncertain.
2. **Preflight before resuming** — run
   `bun "<plugin-root>/scripts/promptus-session-doctor.ts"` before trusting NOW or the
   derived cache. It is read-only. Report a failure and do not rely on the affected state;
   independent authorized work may continue. Repair only within the requested scope.
3. **Store consequential work as you go.** Don't hand-edit the ledger or `.promptus/docs/`.
   Keep decisions, results, sources, and failed routes; repeated checks need no separate entries.
   Append through the gate:
   ```
   printf '%s\n' '<prose body>' | bun "<plugin-root>/scripts/kb-add.ts" --substrate ledger --kind RESULT --status VALIDATED --title '…'
   ```
4. **Verify after a batch** — `bun "<plugin-root>/scripts/promptus-check.ts" --strict` includes
   re-indexing. Use `kb-index.ts` alone when only derived refresh is needed; do not run both
   consecutively on unchanged source.
5. **Retrieve ranked and bounded** — `bun "<plugin-root>/scripts/kb-find.ts" "<query>"`
   returns at most 20 live units by default. Add `--history` only for archived work; never fetch
   an unanchored ledger. Use the `recall` skill when claims must be verified.
6. **Treat outside theory as conjecture** — at one precise theoretical bottleneck, use the
   `thinker-round` skill to seal a self-contained prompt and refute-first plan. The operator carries
   it out and back; preserve the response as `lit:UNTRUSTED`, then keep only independently checked
   claims as linked findings. It is not a workspace agent or a release authority.
7. **Review trajectory at natural boundaries** — use the `trajectory-review` skill when a branch
   closes, its blocker changes, a stopped route may reopen, the operator asks whether work is
   converging, or a major handoff/manuscript/release approaches. Its deterministic packet is bounded
   and read-only; review age is advisory, never a health score or calendar mandate.
8. **Checkpoint before you compact** — `promptus-checkpoint` flushes unrecorded work, updates
   NOW through `kb-now`, and reconciles affected memory. It is not a general cleanup mandate.

Complete the requested outcome and relevant verification. A status or diagnosis request does
not authorize implementation; an implementation request does not end at a proposed next step.
Markdown remains authoritative, derived caches disposable, and new machinery requires measured
benefit. Existing records retain identity, status, provenance, and lifecycle history.
