# Releasing from the Organon monorepo

Releases are **per plugin**. A release is a Git tag `<plugin>-vX.Y.Z` — `promptus-v0.6.0`,
`editio-v0.1.0`. Pushing one runs `.github/workflows/release.yml`, which re-checks everything,
verifies the tag agrees with that plugin's manifest **and** its changelog, and publishes a
GitHub release whose notes come straight from `<plugin>/CHANGELOG.md`. Nothing is published
until the checks pass. The plugins version independently — cutting one never forces the other.

> The marketplace never consumes releases: installs and updates pull from the repo source, and
> each plugin's `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` carry the same
> version; validation rejects drift between them. Tags + releases are the human-facing record.

Routine validated work may land directly on `main`. A release cut is the only mandatory PR
boundary: its versioned changelog finalization and both manifest bumps must merge through a PR,
and only the exact merged release commit may receive the release tag.

## Versioning ([SemVer](https://semver.org), per plugin)

- **MAJOR** — incompatible change to the store layout, the controlled vocab, or a script's CLI.
- **MINOR** — a new substrate / skill / command / renderer, backward compatible.
- **PATCH** — fixes and docs that don't change the contracts.

While a plugin is pre-1.0, a breaking change may ride in a MINOR bump; the changelog
calls it out.

## Cutting a release (for plugin `P`)

1. **Land everything on `main`** and confirm CI is green.
2. **Create a release branch** from that exact `main`, conventionally `release/P-vX.Y.Z`.
3. **Finalize the changelog.** In `P/CHANGELOG.md`, rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD`, open a fresh empty `## [Unreleased]` above it, and update the
   link references at the bottom (the `[Unreleased]` compare URL and a new `[X.Y.Z]` tag URL,
   tags shaped `P-vX.Y.Z`).
   If the work has a cross-plugin draft under `.github/release-notes/`, reconcile it into
   each affected plugin's changelog first; the changelog remains the release-note source of
   record. Do not publish the draft as an Organon-level release.
4. **Bump both adapter manifests.** Set `version` in `P/.claude-plugin/plugin.json` and
   `P/.codex-plugin/plugin.json` to `X.Y.Z`; the validator requires exact parity.
5. **Sanity-check locally:**
   ```bash
   bun run check                                            # adapters validated, live store healthy, tests
   bun promptus/scripts/changelog.ts check X.Y.Z P/CHANGELOG.md   # release-note gate
   ```
6. **Commit** with `chore(release): cut P vX.Y.Z` (scope required; flat `- ` bullet body).
7. **Push the branch and open a PR** with the same scoped Conventional title. Merge only after
   review and all required checks pass; do not tag the branch tip.
8. **Tag the exact merged release commit and push the tag:**
   ```bash
   git fetch origin main
   git tag P-vX.Y.Z <merged-release-commit>
   git push origin P-vX.Y.Z
   ```
9. **Watch the workflow.** It validates, checks the version + changelog, and creates the
   release titled `P vX.Y.Z`. If the `[X.Y.Z]` section in `P/CHANGELOG.md` is missing or
   empty, it stops *before* publishing.

> **READMEs need nothing at a release.** The version badges are tag-prefix filtered and
> update themselves; versions never live in prose (see `CONTRIBUTING.md`, "Docs stay
> truthful").

## What the release workflow guards

- Marketplace + plugin structure (`bun promptus/scripts/validate-plugin.ts`) and tests (`bun test`).
- The tag `P-vX.Y.Z` matches both adapter manifests' identical `version`.
- `P/CHANGELOG.md` has a non-empty `## [X.Y.Z]` section — and that section *is* the release note.

## Notes

- **A new plugin enters `main` at version `0.0.0`.** Its first release-cut PR stamps the real
  version. The version string is the install **cache key** — updaters refresh a cached plugin
  only when it moves — so one version string must never cover two different trees. (Learned
  the hard way: an editio manifest born at `0.1.0` before the plugin's content landed froze
  early installs on the wrong tree, invisibly to `plugin update`.)
- The repo-level "Latest" badge on GitHub points at whichever plugin released most recently;
  release titles carry the plugin name, so the list stays unambiguous.
- History: tags `v0.1.0` … `v0.5.2` predate the monorepo and refer to promptus releases cut
  when the repo *was* the promptus plugin.
