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

## Pull requests

Keep them focused. When you change something user-facing, add a line under `## [Unreleased]`
in the affected plugin's `CHANGELOG.md` (`promptus/` or `editio/`). See `RELEASING.md` for how
per-plugin releases are cut.
