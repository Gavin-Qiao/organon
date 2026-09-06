# Upgrade and compatibility guide

Publication, host installation, and project adoption are three separate steps. Follow
this guide for each project you intend to update; a release never rewrites research
Markdown or proves that an already-running agent has loaded new instructions.

## Update the host first

Keep the previous plugin version and a recoverable project snapshot. Inspect the configured
marketplace before updating: a local checkout must already contain the reviewed release;
a Git marketplace needs a refresh. Do not rewrite installed cache files by hand.

For Codex, inspect `codex plugin marketplace list`. Refresh a configured Git marketplace
with `codex plugin marketplace upgrade organon`, then install the selected source with:

```bash
codex plugin add promptus@organon
codex plugin add editio@organon
```

For Claude Code, refresh the Organon marketplace through its plugin manager and update
the installed plugins there. Verify both installed manifests, not just the repository tags.
Start a new agent task after installation; existing tasks can retain older skills and hooks.
Then perform the per-project preview below. Keep optional raw caching off and semantics
unconfigured unless a separate measured need justifies their resource use.

## Existing projects

The expanded source implementation adds a read-only `promptus-upgrade --root <exact-project>
--installed-plugin <explicit-package-path>` preview. It identifies both package versions and
content fingerprints, source state, custom-policy hash, preflight issues and cache allowance.
It never guesses a sibling project or searches host caches for a convenient installation.

After a separately authorized host update, preview again. The derived-only apply step requires
the same arguments plus `--apply --expect-plan <token>`. A changed source/package/policy/limit
refuses the old plan. It preserves `AGENTS.md` and all research source, runs strict maintenance
and read-only postflight, and emits a per-project result. On failure, derived state may be
partial: inspect diagnostics rather than silently repairing evidence. Repeat after correction
with a fresh preview. To roll back this derived-only operation, select the prior compatible
plugin and rebuild ordinary indexes with it; no authored-source restore is needed.

Apply separately to each authorized project, then reload its agent and perform scoped
find/get and continuation smoke checks. The command verifies the supplied package directory,
not the host's active plugin connection or an already-running session. Before any additional
policy/layout/manuscript edits, keep a recoverable snapshot and obtain that separate scope.

Existing Promptus Markdown needs no overhaul-specific migration. Stable IDs, slugs,
unique aliases, custom vocabulary and lifecycle relations remain readable. Keep a
recoverable project snapshot before any separately authorized adoption. Run read-only
session preflight, inspect its findings, and perform only the repairs in scope.

For a genuinely legacy namespace, `promptus-doctor migrate` previews changes;
`migrate --apply` is a separate source-layout operation. The disposable package test
verifies dry-run preservation, exact evidence bytes after migration, retrieval and
idempotence. It does not authorize migrating any of the four live research projects.

Preserve existing `AGENTS.md` instructions. Integrate a scoped cadence section rather
than replacing the file. A handoff check failing does not stop unrelated authorized
work, and a checkpoint is not an implicit archive-maintenance operation.

## Derived maintenance

The update removes the shell-detecting post-command auto-index hook from both
adapters. `kb-add` still appends the catalog entry and returns a target-bound next
action. After a batch, run `kb-index` for derived refresh or `promptus-check --strict`
for refresh plus integrity verification. Use explicit `--root` outside the project.
Session-start, source-protection and checkpoint hooks remain.

Default lexical retrieval needs no QMD, Node worker or model. Optional semantic
configuration and refresh are separate, per-project operations described in the
[Promptus guide](promptus/README.md#lexical-by-default-semantic-when-useful). Missing
or stale semantic state gives a diagnostic lexical fallback. Concurrent semantic
queries may also fall back while the cache lease is held. Do not treat fallback as
an embedding-quality result or let search ranking replace source verification.

## Manuscripts

Existing manuscript syntax remains accepted. Grounds now resolve canonical IDs,
unique aliases and archived evidence, with effective lifecycle intact. This may
correctly reject manuscripts that previously relied on stale raw `VALIDATED` status
or partially unknown grounds. Review the evidence instead of weakening the gate.

New `.historical` spans distinguish attributed closed evidence from positive support.
Older Editio gates do not understand this grade and leave it ungraded. A rollback
must therefore also restore the compatible manuscript snapshot, or explicitly review
and translate new annotations. Do not silently reinterpret them as validated claims.

## Packaging and rollback boundary

Temporary copies verify both manifests, explicit-root recall, missing-semantic fallback,
legacy migration and Editio gating/rendering without a sibling Promptus installation.
The checked canonical reader is bundled inside Editio; no runtime cross-plugin import
or installed-cache discovery is needed.

Isolated package checks and cross-platform repository CI do not certify desktop hook
delivery or native QMD on every OS. Releases require the normal reviewed PR, then an
exact merged-commit tag; installation and live-project adoption remain separate actions.
Use [RELEASING.md](RELEASING.md) for that workflow.

For a separately authorized rollback, restore the prior plugin and compatible authored
project snapshot. Omit `--semantic` to disable optional recall; its exact project-local
cache may be retired once no operation is active. Never delete source or model files
as an automatic rollback step. Rebuild ordinary derived indexes with the selected
plugin version. Historical evidence receipts remain historical, not rewritten to
match the rollback.
