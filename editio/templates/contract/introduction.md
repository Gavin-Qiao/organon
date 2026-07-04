---
class: deo:Introduction
status: drafting
grounds: [editio-paper-read-port, the-gate]
updated: 2026-07-03
budget: 800
---
# Introduction

Long-running research assistants forget. [A file-based store with a gated writer keeps
what a project knows retrievable across sessions]{.claim .validated grounds=the-gate}, and
[the same discipline appears to transfer to manuscripts]{.claim .conjectured
grounds=editio-paper-read-port}. Prior work established the information-theoretic
framing [@shannon1948; @vaswani2017], and we reported early results in [@ourpaper]{.self}.

[Roughly 40% of retracted papers fail on provenance, not analysis]{.claim .unsourced}.
[Editors increasingly ask for claim-level evidence trails]{.claim}.

The method is defined in @sec:methods, where the entropy $H = -\sum_i p_i \log p_i$ is
**bounded** by construction; the *derivation* uses the `kb-find` primitive. We evaluate on
50% of the corpus & report #tags_used per section.

Our contributions:

- A structure gate grounded in DoCO and DEO
- Three renders from one markdown source
- An audit loop that grades every claim against a store

::: blindhide
This work was funded by Grant 12-345 at Affiliation One.
:::

```latex
\begin{equation}\label{eq:entropy}
  H(X) = -\sum_{i=1}^{n} p_i \log p_i
\end{equation}
```

The bound in @eq:entropy holds for any finite alphabet.

[The gate refuses off-vocab writes even under load ([@sec:methods]), as prior
work anticipated [@shannon1948]]{.claim .validated grounds=the-gate}.

```latex+
\begin{table}[tb]
  \caption{Grounding beats retrieval alone [@vaswani2017]; details in @sec:methods.}
  \label{tab:grounding}
\end{table}
```
