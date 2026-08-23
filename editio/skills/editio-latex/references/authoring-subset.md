# The editio authoring subset (v1.2)

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
| `# Title` (first) | `\section{Title}\label{sec:<file-slug>}` — or `\begin{abstract}` when `class: doco:Abstract` (the abstract keeps the environment only: no `\section`, no label, no provenance stamp). A venue may suppress the printed heading while retaining a cross-reference anchor (`nmi`: Introduction). One `#` per file — a second warns and demotes to `\subsection`; `####`+ is not a heading (warns, renders as prose) |
| `## / ###` | `\subsection` / `\subsubsection` |
| `- item` / `1. item` | `itemize` / `enumerate` (one level, column 0 — an indented bullet warns and flattens into the line above) |
| blank line | paragraph break |
| ```` ```latex … ``` ```` | raw passthrough — the escape hatch for equations, floats, anything beyond the subset. **The fence body is LaTeX, not prose**: escape your own `%` `&` `_` `#` (a bare `%` in a caption swallows the rest of the line and the build) |
| ```` ```latex+ … ``` ```` | raw passthrough **plus** the citation/crossref/`@num:` transforms — `[@key]`, `@fig:x`, `@num:h` work inside captions, so floats and prose share one syntax (v1.1). Same rule: the body is LaTeX; escape your own specials |
| ```` ```other … ``` ```` | `verbatim` (any tag, symbols included — `c++`, `c#`) |
| `::: blindhide … :::` | `\blindhide{…}` (dropped in blind mode) |

## Inline

| construct | renders to |
|---|---|
| `**b**` / `*i*` / `` `c` `` | `\textbf` / `\emph` / `\texttt` |
| `$…$` and `$$…$$` | inline math (verbatim, except a bare `%` is auto-escaped — it would comment out its own closing `$`) and `\[…\]`. **Currency needs `\$`**: two literal dollars on one line pair into a math span and typeset the prose between them as math (the renderer warns when a `$…$` looks like captured prose) |
| `[@key]`, `[@a; @b]` | `\cite{key}` / `\cite{a,b}` |
| `[@fig:x]` · bare `@fig:x @tab:y @sec:z @eq:w` | `\cref{…}` (prefix-dispatched; mixing cite and cref keys in one group is an error). Bare form fires after any non-word neighbour — space, `(`, quotes, dashes |
| `[@key]{.self}` | `\selfcite{key}` (masked in blind) — **single key**; a `;` in a self span is an error, split into separate spans |
| bare `@num:handle` | `\editionum{handle}` — the value bound in `front/numbers.tex` (v1.2; one source of truth per number, see the `editio-numbers` skill). Works in prose, inside `$…$`, and in ```` ```latex+ ```` fences; never bracketed (`[@num:x]` is an error); plain ```` ```latex ```` stays byte-raw (write `\editionum{handle}` there — it's scanned too). Handles are kebab-case `[a-z0-9-]`, no leading/trailing hyphen; a near-miss (`@num:Uppercase`) warns at render and ships as literal text if ignored |
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
parses by balanced brackets (v1.1; the first dogfood's bug). A span that fails to parse —
missing dot (`{claim}`), misspelled class, unbalanced brackets — leaves escaped residue in
the output, and the renderer **warns on stderr** on any residue shape (not a keyword
list), while `{.claim}` quoted in inline code stays warning-free. A typo'd *grade*
(`.validatd`) is a syntactically valid span that renders ungraded — the renderer warns on
unknown claim classes so the downgrade is never silent. A claim span nested INSIDE another
claim span is not supported: the inner span's markup leaks as literal text into the outer
claim (and warns) — split the sentence instead.

## Not in v1.2 (use the ```latex / ```latex+ escape hatch)

Markdown tables and figures (they arrive with editio-tables / editio-figures as units),
nested lists, footnotes, nested claim spans. `\editiotodo{…}` (the draft-mode TODO tint)
has no markdown form — write it directly inside a fence when you want it.
