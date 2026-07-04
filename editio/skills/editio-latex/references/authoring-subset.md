# The editio authoring subset (v1.1)

The markdown a section may use. Deliberately small: it compiles to `editio.sty` macros and
plain LaTeX, never inline LaTeX idioms in prose — so the corpus survives a renderer swap
(pandoc + Lua filter is the documented alternative; any renderer must pass the golden
contract in `templates/contract/`). Rendered output is **mode-invariant**: draft/publish/blind
collapse inside `editio.sty` at compile time, not in the renderer.

## Front-matter (per section)

```
---
class: deo:Introduction     # a DoCO/DEO class from .editio/schema/doco-deo.json
status: drafting            # drafting | frozen (advisory)
grounds: [handle-a, handle-b]  # store handles backing the section (coarse fallback)
updated: 2026-07-03         # feeds the draft-mode provenance stamp
budget: 800                 # advisory word budget (lint, Phase 5)
---
```

## Blocks

| construct | renders to |
|---|---|
| `# Title` (first) | `\section{Title}\label{sec:<file-slug>}` — or `\begin{abstract}` when `class: doco:Abstract` |
| `## / ###` | `\subsection` / `\subsubsection` |
| `- item` / `1. item` | `itemize` / `enumerate` (one level) |
| blank line | paragraph break |
| ```` ```latex … ``` ```` | raw passthrough — the escape hatch for equations, floats, anything beyond the subset |
| ```` ```latex+ … ``` ```` | raw passthrough **plus** the citation/crossref transforms — `[@key]` and `@fig:x` work inside captions, so floats and prose share one citation syntax (v1.1) |
| ```` ```other … ``` ```` | `verbatim` |
| `::: blindhide … :::` | `\blindhide{…}` (dropped in blind mode) |

## Inline

| construct | renders to |
|---|---|
| `**b**` / `*i*` / `` `c` `` | `\textbf` / `\emph` / `\texttt` |
| `$…$` and `$$…$$` | inline math (verbatim) and `\[…\]` |
| `[@key]`, `[@a; @b]` | `\cite{key}` / `\cite{a,b}` |
| `[@fig:x]` · bare `@fig:x @tab:y @sec:z @eq:w` | `\cref{…}` (prefix-dispatched; mixing cite and cref keys in one group is an error) |
| `[@key]{.self}` | `\selfcite{key}` (masked in blind) |
| everything else | escaped automatically (`% & # _ { } ~ ^ \` are safe in prose) |

## Claim spans (the audit loop's carrier)

```
[checkable statement]{.claim}                                  → \claimG  (ungraded, grey in draft)
[…]{.claim .validated grounds=the-gate}                        → \claimV  (clean) + margin handle
[…]{.claim .conjectured grounds=h1,h2}                         → \claimC  (amber)
[…]{.claim .unsourced}                                         → \claimU  (vermilion + tag)
[…]{.claim .conjectured override="narrower unit; kept plain"}  → grade kept; reason stays in source + audit report
```

Grades are written into the source by the audit step (the reviewer agent is read-only — it
reports; the session applies). `ungraded ≠ unsourced`: ungraded means the loop hasn't run;
the publish gate requires **no ungraded, no unsourced, no overclaims** — and since v1.1 the
gate is a command, not prose: `editio-status --gate` (report: `editio-status`, ungraded
locations: `--claims`).

Span text may nest citations and crossrefs — `[the same percept ([@sec:theory])]{.claim}`
parses by balanced brackets (v1.1; the first dogfood's bug). A span that still fails to
parse leaves `]{.claim}` residue in the output, and the renderer now **warns on stderr**
when any survives — it never blocks (that stays the gate's job).

## Not in v1.1 (use the ```latex / ```latex+ escape hatch)

Markdown tables and figures (they arrive with editio-tables / editio-figures as units),
nested lists, footnotes, nested claim spans.
