---
description: Preflight a long-running Promptus project for a resuming agent — strictly read-only, bounded, and fail-closed on stale handoff or retrieval state.
argument-hint: "[--json] [--artifacts]"
---

# /promptus-session-doctor — read-only session preflight

Run this before a session agent trusts a long-running project's NOW handoff or derived retrieval
cache. It reads the live four-store Markdown truth, the disposable cache, and the health receipt;
it never reindexes, repairs, refreshes NOW, records a baseline, or edits a unit.

## Workflow

1. From the project being resumed, run:
   ```
   bun "${CLAUDE_PLUGIN_ROOT}/scripts/promptus-session-doctor.ts"
   ```
   Use `--json` when another agent or tool will consume the report. Add `--artifacts` only when a
   live re-hash of the artifact dependencies already named by the cached graph is worth the extra
   time.
2. Treat exit `0` as permission to trust the reported handoff and retrieval surfaces. Read the
   exact north star, NOW, blocker, next action, and resume point from the report before acting.
3. Treat exit `1` as **do not trust the affected state**. Report the issue codes and inspect
   authoritative source when available; independent authorized work may continue. The preflight
   itself never repairs anything. Perform remediation only when covered by the existing task;
   a status-only request does not authorize writes, and expanding scope still needs direction.
4. Treat exit `2` as a tool/precondition failure (for example, no reachable `.promptus/` store or
   unreadable required source). Report the error without claiming anything about project state.

The report distinguishes current evidence from stale cached history, checks every live Markdown
unit against both catalog and lexical index and every archived unit against cold search, detects stable-ID and search-key collisions, validates
the append sentinel and NOW marker, verifies any governed thinker exchange without misclassifying it
as an extra store, reports graph/alias/ratchet/artifact debt, keeps active artifact failures red
while classifying superseded- or retired-unit drift as archival warnings, and always states its read-only guarantee.
