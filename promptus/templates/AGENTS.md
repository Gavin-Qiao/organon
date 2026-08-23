# AGENTS.md — <PROJECT NAME>

> Template cadence for a Promptus-managed project. `/promptus-init` drops this in.

## Cadence

1. **Read `.promptus/TELOS.md` first** — the direction and the rules that never bend.
2. **Preflight before resuming** — run
   `bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-session-doctor.ts"` before trusting NOW or the
   derived cache. It is read-only; stop and report a non-zero result.
3. **Store as you go.** Don't hand-edit the ledger or `.promptus/docs/`. Append through the gate:
   ```
   echo "<prose body>" | bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate ledger --kind RESULT --status VALIDATED --title "…"
   ```
4. **Re-index after writes** — `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts"`.
5. **Retrieve ranked and bounded** — `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-find.ts" "<query>"`
   returns at most 20 live units by default. Add `--history` only for archived work; never fetch
   an unanchored ledger. Use the `recall` skill when claims must be verified.
6. **Treat outside theory as conjecture** — at one precise theoretical bottleneck, use the
   `thinker-round` skill to seal a self-contained prompt and refute-first plan. The operator carries
   it out and back; preserve the response as `lit:UNTRUSTED`, then keep only independently checked
   claims as linked findings. It is not a workspace agent or a release authority.
7. **Checkpoint before you compact** — `/checkpoint` flushes anything un-recorded so
   nothing is lost, reconciles memory, then tidies.
