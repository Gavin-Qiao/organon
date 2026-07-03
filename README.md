<div align="center">

# Organon

**The research toolbox for Claude Code.**
Remember everything your project learns. Write only what you can defend.

[![CI](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml/badge.svg)](https://github.com/Gavin-Qiao/organon/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)
[![runtime: bun](https://img.shields.io/badge/runtime-bun-black.svg)](https://bun.sh)

**[promptus](promptus/README.md)** — the memory system · **[editio](editio/README.md)** — the writing toolchain

</div>

> Greek *organon* — "instrument". Aristotle's *Organon* was the toolkit of sound reasoning;
> this one is the toolkit of sound research: one epistemic frame, two plugins.

---

## Why

Two failure modes stalk long-running agentic research. The agent **forgets** — compactions eat
decisions, dead-ends get re-explored, settled questions quietly reopen. And the write-up
**overclaims** — prose that sounds more certain than the evidence behind it. Organon is one
answer to both: **every claim traces to evidence at a known status** — stored that way,
retrieved that way, and rendered that way on the page.

| plugin | job | release |
|---|---|---|
| [**promptus**](promptus/README.md) | Store / keep / retrieve what a project knows as gated markdown — events, literature, findings, memory — every unit tagged with its epistemic status, navigable by a `[[link]]` graph. `grannie` is the one human read-port. | [![promptus](https://img.shields.io/github/v/release/Gavin-Qiao/organon?filter=promptus-v%2A&label=promptus)](https://github.com/Gavin-Qiao/organon/releases) |
| [**editio**](editio/README.md) | Turn what the store has validated into a defensible, submittable paper — DoCO/DEO-gated structure, one markdown source with three renders (draft / publish / blind), and an audit loop that grades every claim against the store. The spine and the figure craft ship today; tables and bibliography land in phases. Includes `humanizer`. | [![editio](https://img.shields.io/github/v/release/Gavin-Qiao/organon?filter=editio-v%2A&label=editio)](https://github.com/Gavin-Qiao/organon/releases) |

## Install

```text
/plugin marketplace add Gavin-Qiao/organon
/plugin install promptus@organon
/plugin install editio@organon
```

Requires [bun](https://bun.sh) ≥ 1.3 (the bundled scripts are TypeScript on bun; nothing else
to host or vendor). editio additionally wants a TeX distribution at build time — its
`editio-latex` skill sets one up in about five minutes.

<details>
<summary><strong>Migrating from the promptus-only marketplace?</strong></summary>

The marketplace was renamed `promptus` → `organon` and the repo moved to
`Gavin-Qiao/organon`. Remove the old reference, then install both plugins:

```text
/plugin marketplace remove promptus
/plugin marketplace add Gavin-Qiao/organon
/plugin install promptus@organon
/plugin install editio@organon
```

`humanizer` now ships with editio, not promptus — `grannie` dials it automatically when
editio is installed.

</details>

## Quick start

Sixty seconds, end to end, in any repo:

```text
/promptus:promptus-init        # stand up the four stores (.promptus/), Telos first
```

…then just work. The `research-ledger` skill records decisions, results, and dead-ends
through the gate as you go; `recall` retrieves them — header-first, every hit carrying its
`substrate:status` — before you claim anything the project already answered. When the work
is worth publishing:

```text
/editio arxiv                  # scaffold .editio/paper/ — sections, gate, render layer
```

Write sections as markdown with claims in spans, grade them against the store, and build:
draft shows every claim's confidence on the page; publish strips the scaffolding; blind
masks your identity. `/promptus:help` is the map.

## Philosophy

> **The invariant** — markdown is the only source of truth · the index is derived &
> disposable · writes go through a gated script, never freehand · prefer a script over a
> server · add machinery only past a threshold you've **measured**.

- **Epistemic integrity by division of labor.** The LLM does only what needs judgment —
  prose, relevance, what to keep. Deterministic scripts own everything a model can get
  wrong: timestamps, ids, placement, indexes, the validation gate. What rides on the model
  is minimized; what remains can't quietly rot.
- **Status on everything.** `CONJECTURED` is not `VALIDATED`; a `DEADEND` is worth keeping;
  prose calibrates to what the store actually supports. The same rule reaches the page:
  editio's draft render shows each claim's grade in the margin of your attention.
- **Skills, not stacks.** The durable value is portable expertise and conventions. Every
  bundled script is a thin, swappable reference implementation; your TeX distribution, your
  plotting library, your build are yours — documented, never vendored.
- **Measured by use.** This repo dogfoods itself: its own research memory lives in
  [`.promptus/`](.promptus/), written through its own gate, and editio's first paper is
  graded against it. Machinery is added when real use demands it, never on spec.

The full five principles, the architecture, and the prior-art bibliography live in the
[promptus README](promptus/README.md#design-philosophy).

## Anatomy

```text
organon/
├─ .claude-plugin/marketplace.json    the organon marketplace (two plugins)
├─ promptus/                          the store: kb-* scripts · skills · hooks · templates
├─ editio/                            the writing toolchain: /editio · skills · renderer · venues
└─ .promptus/                         Organon's own knowledge, kept by promptus itself
```

## Development

```bash
bun run check     # marketplace + both plugins validated, then the full test suite
bun test          # tests only
```

Releases are per-plugin tags — `promptus-vX.Y.Z` / `editio-vX.Y.Z` — cut per
[`RELEASING.md`](RELEASING.md); conventions live in [`CONTRIBUTING.md`](CONTRIBUTING.md);
the working cadence for agents in [`AGENTS.md`](AGENTS.md).

## License

GPL-3.0 (© 2026 Mohan Qiao) — see [`LICENSE`](LICENSE). The editio plugin's
`skills/humanizer` is an extended fork of
[blader/humanizer](https://github.com/blader/humanizer); its upstream MIT notice is
preserved in [`editio/NOTICE`](editio/NOTICE).
