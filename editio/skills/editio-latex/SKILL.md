---
name: editio-latex
description: Build the paper — set up a TeX distribution in minutes, scaffold or rebuild the .editio/paper/ workspace for a venue, compile the three modes (draft/publish/blind), preview a single section, and keep notation defined-once. Use when installing or detecting TeX, adding a venue, running latexmk, switching modes, or the build breaks. The toolchain is the user's (skills, not stacks): latexmk is the swappable reference driver, venues are data folders.
---

# editio-latex — the typeset layer

Markdown is the source of truth; this skill owns everything from the rendered `.tex` down to
the PDF. Nothing here is vendored: TeX belongs to the user, `latexmk` is a reference driver,
and a venue is a data folder you can add without touching a script.

## TeX setup (once per machine, ~5 minutes)

1. **Detect first** — `latexmk -v` and `pdflatex -version`. Both answering = done.
2. **Install if missing**, per OS — ask the user which they prefer, then guide:
   - **Windows:** MiKTeX (`winget install MiKTeX.MiKTeX`) — set auto-install of missing
     packages to *Yes* (or export `MIKTEX_AUTOINSTALL=yes` per build), or TeX Live.
   - **macOS:** MacTeX (`brew install --cask mactex-no-gui`).
   - **Linux:** TeX Live (`sudo apt install texlive-latex-extra latexmk` or distro equivalent).
3. **latexmk** ships with TeX Live/MacTeX; on MiKTeX it is a package (auto-installs on first
   use; it needs a Perl — MiKTeX bundles one).
4. Never vendor any of this into a repo; record the user's choice and move on.

## Scaffold a workspace

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-scaffold.ts" [--venue arxiv|tpami] [--order imrad|cs-systems|theory] [--force]
```

Idempotent: authored files (`paper.json`, `sections/*.md`, `refs.bib`, the schema) are seeded
once and never overwritten; generated files (`main.tex`, `front/metadata.tex`, `editio.sty`,
`.latexmkrc`) refresh only with `--force`. Identity lives in `paper.json` **only** — edit it
there, and it reaches every document as **data macros**: `editio-identity` generates
`front/identity.tex` (`\PaperTitle`, `\AuthorList`, `\CorrAuthorShort`, `\Author…Name`, …) and,
for venues with a `bio_env`, `front/bios.tex`; the generated metadata assembles the venue's
author block *from those macros* and wraps it in `\ifeditioblind` so blind builds mask it.
Class-specific formatting stays in the consumers; the macros are pure data. Changing the title,
author order, or corresponding author is one paper.json edit + `editio-render --all` (which
regenerates the identity layer) — the doctor flags a stale `identity.tex` or a name hard-coded
in any document `.tex`.

## Build

```
bun "${CLAUDE_PLUGIN_ROOT}/scripts/editio-render.ts" --all   # md → tex
latexmk main.tex                                              # → build/main.pdf (the .latexmkrc drives it)
```

**Modes.** `main.tex` defaults `\editiomode` to `draft` via `\providecommand`, so override
without editing anything:

```
latexmk -usepretex='\def\editiomode{publish}' -outdir=build-publish main.tex
```

(Shell caveat: git-bash mangles a leading `\` in arguments — there, write a two-line wrapper
`_publish.tex` containing `\def\editiomode{publish}\input{main.tex}` and build that, or use
PowerShell/cmd.)

**Outputs & snapshots.** The canonical, always-current PDFs live in the build dirs —
`build/main.pdf` (draft), `build-publish/main.pdf` (publish) — read and hand off from
there. The paper source root stays PDF-free: a loose copy goes stale silently, isn't
gitignored the way the build dirs are, and can shadow the real output by name (the doctor
flags these as `strays`). For a durable snapshot ("the version I sent co-authors"), copy
into an `archive/` dir under a dated, self-describing name — e.g.
`mypaper_2026-07-07_publish.pdf` — never a bare `main.pdf` beside the sources.

**Versioning.** The markdown sources ARE the paper, so git is its version history —
editio does not rebuild version control one layer up. Commit the paper dir (sections,
`paper.json`, `numbers.json`, `refs.bib`; keep the `build*/` dirs ignored) and tag
milestones (`paper-v1-submitted`, `paper-v2-camera`): diffs, history, and "the version
I sent co-authors" all come from git. The doctor flags sources a repo ignores or never
tracked — a gitignored paper dir means zero committed versions of a submittable paper.

## Preview one section (the big-paper latency fix)

Write `_preview.tex` next to `main.tex`:

```latex
\providecommand{\editiomode}{draft}
\documentclass{article}\usepackage{editio}\usepackage{amsmath,graphicx,booktabs}
\usepackage{hyperref}\usepackage[capitalise]{cleveref}
\begin{document}\InputIfFileExists{sections/methods}{}{}\end{document}
```

`latexmk _preview.tex` compiles that section alone in seconds. Cross-refs into other sections
show as `??` in preview — that is expected, not broken.

## Notation (defined once, used everywhere)

Keep shared math macros in `front/macros.tex` (\input it from `main.tex` when it exists) and
one meaning per symbol. Convention: a symbol may trace to a store handle the way a claim
traces to a unit — note the `[[handle]]` in a comment beside the macro. The
defined-once-and-used check lands in editio-lint (Phase 5).

## Venues are data

`templates/venues/<id>/venue.json` (class, options, columns, widths in mm, bib style, author
format, notes). Adding a venue = adding a folder; the scaffold and the coming figure/lint
skills read the same file. Seeded today: `arxiv`, `tpami`.

## The authoring subset

What the renderer accepts is a deliberate, documented subset — see
`references/authoring-subset.md`. Anything beyond it goes in a ```latex fence (the escape
hatch) rather than inventing markdown.
