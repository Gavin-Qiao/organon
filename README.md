# Organon

[![CI](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml/badge.svg)](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml)

The research toolbox for [Claude Code](https://claude.com/claude-code) — one marketplace, two plugins:

| plugin | what it is |
|---|---|
| [**promptus**](promptus/README.md) | The memory system for long-running LLM agentic projects: store / keep / retrieve a project's knowledge as gated markdown, navigable by status and a `[[link]]` graph. `grannie` is the one human read-port. |
| [**editio**](editio/README.md) | The academic-writing toolchain: turn what the store has validated into a defensible, submittable paper — structure, three renders, figures, bibliography, venue packaging. Ships `humanizer`. Requires promptus. |

## Install

```
/plugin marketplace add Gavin-Qiao/organon
/plugin install promptus@organon
/plugin install editio@organon
```

> **Migrating from the promptus-only marketplace?** The marketplace was renamed
> `promptus` → `organon` (and the repo moved to `Gavin-Qiao/organon`). Remove the old
> reference and re-add: `/plugin marketplace remove promptus`, then the commands above.
> Note that `humanizer` now ships with editio, not promptus.

## Development

TypeScript on [bun](https://bun.sh); no runtime dependencies.

```bash
bun run check     # marketplace + both plugins validated, then the full test suite
bun test          # tests only
```

This repo dogfoods promptus on itself: its research memory lives in `.promptus/` at the repo
root, shared by both plugins' development (see `AGENTS.md` for the working cadence). Releases
are per-plugin tags — `promptus-vX.Y.Z` / `editio-vX.Y.Z` (see `RELEASING.md`).

## License

GPL-3.0 (© 2026 Mohan Qiao). The editio plugin's `skills/humanizer` preserves the upstream
[blader/humanizer](https://github.com/blader/humanizer) MIT notice in `editio/NOTICE`.
