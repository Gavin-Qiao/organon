# AGENTS.md — <PROJECT NAME>

> Template cadence for a Promptus-managed project. `/promptus-init` drops this in.

## Cadence

1. **Read `.promptus/TELOS.md` first** — the direction and the rules that never bend.
2. **Store as you go.** Don't hand-edit the ledger or `.promptus/docs/`. Append through the gate:
   ```
   echo "<prose body>" | bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" --substrate ledger --kind RESULT --status VALIDATED --title "…"
   ```
3. **Re-index after writes** — `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts"`.
4. **Retrieve header-first** — `bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-find.ts" "<query>"` (or the `recall` skill).
5. **Checkpoint before you compact** — `/checkpoint` flushes anything un-recorded so
   nothing is lost, reconciles memory, then tidies.
