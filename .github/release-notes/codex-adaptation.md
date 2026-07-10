# Draft release note — native Codex adaptation

**Status: unreleased.** This is the cross-plugin preview; the per-plugin `[Unreleased]`
changelog sections remain the release-note sources of record when tags are eventually cut.

Organon now supports Codex natively without forking its research model. Promptus and editio
ship `.codex-plugin` manifests and appear through a repository `.agents/plugins` marketplace,
while continuing to support their Claude Code adapters.

## Promptus

- Installs its existing research skills plus portable workflows for initialization,
  checkpointing, store health, migration, ingestion, graph inspection, and grounded review.
- Adds Codex lifecycle hooks for session orientation, gate protection, automatic indexing,
  and pre-compaction checkpoint reminders.
- Understands Codex `apply_patch` inputs, preserves stable ledger identity across graph walks,
  and adds an authoritative whole-store integrity check.

## editio

- Exposes the same evidence-calibrated writing skills through a native Codex manifest.
- Resolves bundled scripts from the installed skill location, independent of host-specific
  shell variables.
- Rejects validated prose over conjectured, provisional, refuted, retired, or otherwise weak
  evidence instead of relying on a permissive denylist.

## Platforms

Codex hook launchers use the POSIX command on macOS and Linux and a `commandWindows` override
on Windows. CI executes the adapter validator and full test suite on Ubuntu, Windows, and macOS;
the hook regression runs the platform-selected command rather than only inspecting JSON.

## Install preview

```bash
codex plugin marketplace add Gavin-Qiao/organon
codex plugin add promptus@organon
codex plugin add editio@organon
```

Start a new Codex task after installation. Promptus hooks remain opt-in executable code: review
and trust them with `/hooks`. No release tags have been created for this work.
