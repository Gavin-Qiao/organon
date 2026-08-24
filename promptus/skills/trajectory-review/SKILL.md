---
name: trajectory-review
description: Review whether a long-running research endeavour is moving, narrowing, parking, or reopening for good reasons. Use for a bounded retrospective at a branch closure, blocker change, major handoff, manuscript/release checkpoint, proposed route reopening, or when the operator asks whether the work is converging. Collects deterministic Promptus evidence first; never scores research quality or mutates authority automatically.
---

# Trajectory review

Turn a bounded slice of the Promptus record into an evidence-grounded judgement about trajectory.
Promptus supplies anti-amnesia and a reproducible packet; you supply the retrospective reasoning.
This is not a scheduler, progress score, publication template, or automatic research manager.

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md`. Every command below uses
that installed root and the project root discovered by Promptus.

## Collect before judging

Run the deterministic collector first:

```text
bun "<plugin-root>/scripts/promptus-trajectory-review.ts" \
  --scope project --max-units 200 --json
```

For one endeavour, pass its exact opening/root stable ID as `--scope <id>`. Do not substitute a
title or lexical query: the collector intentionally refuses fuzzy scope membership. `--since` is
exclusive, `--through` inclusive. With no `--since`, the collector continues from the unique tail
review for this exact scope; a review of another endeavour is irrelevant. It fails instead of
guessing when the prior chain, boundary, health receipt, source fingerprint, graph traversal, or
thinker custody is unsafe. It also fails rather than truncating when the selected units plus causal
context exceed `--max-units`.

Read `frontier.orientation` and its Telos/NOW references before interpreting the evidence. The
collector has already run the read-only session doctor and embedded only bounded orientation, not
the Telos, NOW, or ledger body.

## Review with source custody

1. Treat `units`, `causalContext`, status/kind counts, disposition groups, and reopen candidates as
   navigation—not conclusions. A large validated store is not evidence of progress, and a title or
   PageRank score does not reveal scientific sign or importance.
2. Reconstruct material causal steps from `causalRelations`, not chronology alone. Give explicit
   negative dispositions (`REFUTED`, `CONFOUNDED`, `SUPERSEDED`, `retired`, `DEADEND`, `MISTAKE`)
   the same analytical weight as surviving positive results. Preserve what each failure rules out.
3. Retrieve header-first, then fetch every body used for a claim:

   ```text
   bun "<plugin-root>/scripts/kb-get.ts" "<packet path>" --title "<packet title>"
   ```

   Use the `recall` skill when the review needs evidence outside the packet. Do not cite or infer
   from a unit whose body you did not read.
4. Calibrate to `substrate:status`. Raw thinker material stays `lit:UNTRUSTED`; a later validated
   finding may independently support a claim, but it does not retroactively validate the raw return.
   Say which sentences are store-backed facts and which are retrospective inference.
5. If the record does not connect two steps, name the gap. Never manufacture continuity. A
   `reopenCandidate` is only a prompt to inspect both bodies and the new evidence—not permission to
   reopen a stopped route.

## Concise review contract

Answer these questions in endeavour-neutral language:

1. What endeavour and success contract opened this trajectory?
2. What were the material steps and turning points?
3. What positive results now survive?
4. What negative results, dead ends, or impossibilities survive, and what do they rule out?
5. Which assumptions, targets, or definitions changed?
6. What became easier, harder, narrower, or more externally grounded?
7. Which work belongs in the main spine, supporting material, a reusable method, a parked branch,
   or a retired branch?
8. What exact new evidence would reopen each parked or retired route?
9. Is the proposed next step selected because it changes the endeavour, or only because it is the
   next available local task?
10. What is the smallest decisive next test, and what would each outcome change?
11. What does this review not establish?

The five placement labels in question 7 are retrospective judgements, not Promptus statuses. End
with proposed decisions separately identified. Do not edit Telos, NOW, memory, unit status, or a
research branch merely because the review proposes park/retire/reopen.

## Persist only on explicit operator instruction

Default output is a draft in conversation. If—and only if—the operator explicitly asks to store the
review, write it as one immutable `finding:REVIEW` through `kb-add`, using the packet's exact
machine fields:

```text
<review body on stdin> | bun "<plugin-root>/scripts/kb-add.ts" \
  --substrate finding --kind REVIEW --status VALIDATED \
  --title "Trajectory review — <scope and boundary>" \
  --review-scope "<packet.scope.key>" \
  --review-since "<packet.boundary.since.marker>" \
  --review-through "<packet.boundary.through.marker>" \
  --review-fingerprint "<packet.source.fingerprint>"
```

When `packet.boundary.priorReview` is non-null, add exactly
`--rel extends:<prior-review-id>`. The write gate rechecks the source fingerprint, current healthy
receipt, scope, boundaries, and same-scope predecessor inside the store lock. If anything changed,
collect and adjudicate again; never patch the metadata around the refusal.

Run the returned portable `next_action.argv` to re-index, then run the installed
`promptus-check` so the new source has a current health receipt. Persist any accepted project
decision separately through the existing ledger/Telos/NOW authorization boundary; the review itself
does not promote a recommendation.

## When to recommend—not require—a review

Recommend one at a natural phase boundary: a branch closes or changes blocker category; several
thinker rounds accumulated; a new theory/application programme is about to open; a stopped route is
proposed for reopening; the operator asks whether work is converging; or a manuscript, release,
handoff, or major objective checkpoint approaches. Review age and absence are advisory. Never invent
a calendar, event quota, staleness threshold, or deterministic “spiralling” score.
