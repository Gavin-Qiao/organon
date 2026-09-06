# Contributing to Organon

Organon (the promptus + editio plugins) is a small, opinionated system; the bar is "honest,
grounded, and tested."

## Setup

- Install [bun](https://bun.sh) (≥ 1.3).
- `bun test` runs the suite; `bun run check` validates both agent adapters, checks the live
  Promptus store with `--strict`, and runs the tests.
- With the Claude CLI, `claude plugin validate <plugin-dir>` runs its full per-plugin check.
  For Codex, use a disposable `CODEX_HOME` and `codex plugin marketplace add .` followed by
  `codex plugin add <plugin>@organon` for an install smoke test.

## Local checks (pre-commit / pre-push)

The repo ships a `.pre-commit-config.yaml`: formatting / JSON / YAML hygiene on commit, and
the plugin validator + tests on push. Enable it with:

```bash
pre-commit install --hook-type pre-commit --hook-type pre-push
```

> **Operator note:** if your global Git `core.hooksPath` already delegates to `pre-commit`
> (the shared Codex/Claude hook setup), do **not** run `pre-commit install` — it would
> overwrite the shared hooks. They pick up this repo's config automatically.

CI runs the same hooks, so a clean local run should mean a clean push or PR.

The cross-OS matrix runs on Ubuntu, Windows, and macOS. Codex hook tests execute the selected
launcher (`command` on macOS/Linux, `commandWindows` on Windows) with a real payload; adding a
hook requires both fields and an executable regression, not only schema validation.

## Conventions

- **Commits:** Conventional Commits with a **mandatory scope** and a flat `- ` bullet body —
  e.g. `feat(kb-find): add a status filter`. The `commit-msg` hook enforces this; never
  `--no-verify`.
- **PR titles:** the same scoped Conventional shape is mandatory: `type(scope): subject`.
  `promptus/scripts/check-pr-title.ts` gates opened, edited, synchronized, reopened, and
  ready-for-review PRs in CI. Unscoped titles do not pass.
- **Agent co-authorship (this project only):** when Codex, Claude, or another named agent makes a
  material contribution, it may proudly add `- Co-authored-by: Name <email>` to the enforced flat
  bullet body and identify itself in the PR. Never fabricate a human co-author.
- **Forward-slash paths** in any committed command/settings strings.
- **Store discipline:** new knowledge enters through `kb-add`; existing curated-unit metadata
  changes through `kb-amend`. Never hand-edit ledger log lines. Only `.promptus/cache/` is derived.
- **Scripts** are TypeScript on bun, stdlib-first.

## Docs stay truthful

The store's discipline — no drift between the record and reality — applies to the repo's own
front pages. Two standing rules, then the event map:

- **Docs ride the change.** A change that alters what ships updates the affected READMEs (and
  `AGENTS.md`) *before it lands* — never "in a follow-up".
- **Versions never live in prose.** The tag-prefix-filtered release badges and each plugin's
  `plugin.json` carry them. If you are about to type a version number into a README, stop.

| when this lands… | update this |
|---|---|
| a release is cut | review affected human docs and adoption guidance; version badges update themselves (see `RELEASING.md`) |
| a skill / command / script ships | the plugin's README (what-ships / commands tables) + its `CHANGELOG.md` `[Unreleased]` + `AGENTS.md`'s layout if the shape changed |
| a plugin joins the marketplace | the root `README.md` (hero cross-link + release badge) · both marketplace manifests · both adapter manifests · `AGENTS.md`'s layout · the plugin README + `CHANGELOG.md` |
| one capability changes both plugins | both `[Unreleased]` changelogs + a draft under `.github/release-notes/` until the per-plugin releases are cut |
| a skill distills craft from a source | the source's full citation in the skill's `references/*.md` + an entry in the plugin README's **References** + a lit unit (`kb-add --substrate lit`) — see below |
| behavior moves or reframes (a skill migrates, a verb changes meaning) | a **re-truth sweep**: grep the old claim across the READMEs / `AGENTS.md` / the Telos / skill descriptions, fix every hit in the same change, and record it in the ledger |

### References are load-bearing

The skills ship *distilled* craft, and every distillation names its sources — we want
references. Credit is part of staying truthful: the citations are how a reader (or a future
agent) audits what we adopted, and "stand on the shoulders of giants" means saying whose.
When a change distills guidance from a source, that change gives the source three homes:

1. **the skill's `references/*.md`** — a full citation (authors, year, title, venue, DOI or
   canonical URL) next to the distilled guidance;
2. **the plugin README's References section** — the reader-facing bibliography;
3. **the lit store** — a `kb-add --substrate lit` unit, so store retrieval can ground any
   claim that leans on it.

Distill in your own words: pointers and transferable moves, never reproduced text
(copyright) — link the original and send readers to it. An uncited "best practice" in a
skill is a claim without grounds; treat it exactly like one.

## Landing changes and pull requests

Routine non-release changes may be committed and pushed directly to `main` after the relevant
local gates pass; CI runs again on the push. A PR remains available when review or collaboration is
useful, but it is not required for ordinary work.

Repository policy permits that direct route; remote branch protection may still require a PR.
When GitHub rejects a routine push, use a PR and its required checks. Do not bypass or weaken
protection to reconcile it with this policy.

Every release cut is different: the versioned changelog finalization and both manifest bumps must
land through a PR before the merged release commit is tagged. See `RELEASING.md` for that workflow.

Whichever route a change takes, keep it focused. When you change something user-facing, add a line
under `## [Unreleased]` in the affected plugin's `CHANGELOG.md` (`promptus/` or `editio/`) and keep
the docs truthful (the section above). When a PR is used, title it with a scoped Conventional title
such as `feat(codex): add native plugin adapters`; CI enforces the shape, including after title
edits. Complete the PR template's release-note section.
