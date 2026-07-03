# Contributing to Organon

Organon (the promptus + editio plugins) is a small, opinionated system; the bar is "honest,
grounded, and tested."

## Setup

- Install [bun](https://bun.sh) (≥ 1.3).
- `bun test` runs the suite; `bun run check` validates the marketplace + both plugins **and** runs the tests.
- With the Claude CLI, `claude plugin validate <plugin-dir>` runs the full per-plugin check.

## Local checks (pre-commit / pre-push)

The repo ships a `.pre-commit-config.yaml`: formatting / JSON / YAML hygiene on commit, and
the plugin validator + tests on push. Enable it with:

```bash
pre-commit install --hook-type pre-commit --hook-type pre-push
```

> **Operator note:** if your global Git `core.hooksPath` already delegates to `pre-commit`
> (the shared Codex/Claude hook setup), do **not** run `pre-commit install` — it would
> overwrite the shared hooks. They pick up this repo's config automatically.

CI runs the same hooks, so a clean local run should mean a clean PR.

## Conventions

- **Commits:** Conventional Commits with a **mandatory scope** and a flat `- ` bullet body —
  e.g. `feat(kb-find): add a status filter`. Omit `Co-Authored-By`. The `commit-msg` hook
  enforces this; never `--no-verify`.
- **Forward-slash paths** in any committed command/settings strings.
- **Store discipline:** knowledge enters through `kb-add` (the gate), never freehand. Don't
  hand-edit the ledger log lines or `.promptus/` (it's derived and gitignored).
- **Scripts** are TypeScript on bun, stdlib-first.

## Docs stay truthful

The store's discipline — no drift between the record and reality — applies to the repo's own
front pages. Two standing rules, then the event map:

- **Docs ride the change.** A PR that alters what ships updates the affected READMEs (and
  `AGENTS.md`) *in the same PR* — never "in a follow-up".
- **Versions never live in prose.** The tag-prefix-filtered release badges and each plugin's
  `plugin.json` carry them. If you are about to type a version number into a README, stop.

| when this lands… | update this |
|---|---|
| a release is cut | nothing — the badges update themselves (see `RELEASING.md`) |
| a skill / command / script ships | the plugin's README (what-ships / commands tables) + its `CHANGELOG.md` `[Unreleased]` + `AGENTS.md`'s layout if the shape changed |
| a plugin joins the marketplace | the root `README.md` (hero cross-link + a table row with a `<plugin>-v*`-filtered release badge) · `marketplace.json` · `AGENTS.md`'s layout · the new plugin's own README in the house shape (hero → epigraph → why → install → quick start → what ships → license) + its `CHANGELOG.md` |
| behavior moves or reframes (a skill migrates, a verb changes meaning) | a **re-truth sweep**: grep the old claim across the READMEs / `AGENTS.md` / the Telos / skill descriptions, fix every hit in the same PR, and record the change in the ledger |

## Pull requests

Keep them focused. When you change something user-facing, add a line under `## [Unreleased]`
in the affected plugin's `CHANGELOG.md` (`promptus/` or `editio/`) and keep the docs truthful
(the section above). See `RELEASING.md` for how per-plugin releases are cut.
