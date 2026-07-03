# Telos — <PROJECT NAME>

> Template. `telos` / `/promptus-init` fills this in. Telos comes first: every
> other store answers to the direction set here.

## North star

<One paragraph: what this project is trying to find out, and for whom.>

## The four stores

| store | path | retrieve it to… |
|---|---|---|
| **Telos** | `.promptus/TELOS.md` | know the direction |
| **Ledger** | `.promptus/ledger/RESEARCH-LEDGER.md` | reconstruct what happened & why |
| **Knowledge** | `.promptus/docs/` + `.promptus/docs/lit/` | ground a claim |
| **Memory** | `.promptus/memory/MEMORY.md` (per-project) | not relearn what was settled |

## Rules that never bend (the invariant)

> markdown is the only source of truth · the index is derived & disposable ·
> writes go through a gated script, never freehand · prefer a script over a
> server · add machinery only past a threshold you've **measured**.

<Add any project-specific rules that never bend.>

## What lives here — and what doesn't

Direction only, **rewritten in place** when it changes. Events, results, and
decisions-with-dates go through `kb-add` into the ledger; the live frontier ("where we are
now", next actions) is the ledger's **NOW-header** (`kb-now`); settled durable facts go to
memory. If you are typing a date into this file, you are writing a ledger line into the
wrong store — `promptus-doctor check` flags it.
