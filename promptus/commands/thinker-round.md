---
description: Ask a stateless external thinker one strong theoretical question, quarantine the return, and independently decide what survives.
argument-hint: "[draft | prepare | receive | status] [round-id]"
---

# /thinker-round — outside reasoning without borrowed authority

Use a thinker round when the project has reached one precise theoretical bottleneck that is worth
a fresh, context-free attack. The external thinker has no workspace, tools, network, session
history, or memory of earlier rounds. The operator manually carries the prompt out and the response
back. Promptus preserves the exchange; the main agent remains responsible for every conclusion.

This is deliberately a small loop:

`one bounded question → frozen ways to test it → exact return → quarantine → independent verdict`

Resolve `${CLAUDE_PLUGIN_ROOT}` to the installed Promptus plugin root. On hosts without that
variable, use the plugin root supplied by the calling skill.

## 1. Decide whether a round earns its keep

Retrieve the project's relevant findings, literature, decisions, and dead ends first. Try the
problem locally. Open a round only when you can name both:

- the exact proposition, lemma, counterexample, mechanism, or incompatibility that blocks progress;
- what a useful answer could change.

Do not use a thinker round for a general brainstorm, code review, literature search, factual lookup,
workspace inspection, or a question whose real context is still hidden in files. If the question
needs the repository, use a normal project agent. If no returned answer could change the next
action, do not send it.

## 2. Draft one self-contained question

Choose a short, durable round id and scaffold the two working files. Preview first:

```sh
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" draft \
  --id <round-id> --title "<the actual question>" --root .
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" draft \
  --id <round-id> --title "<the actual question>" --apply --root .
```

Then write `.promptus/thinker/rounds/<round-id>/prompt.md`. Make it possible to reason from that
file alone:

- define every object, symbol, assumption, quantifier, and success criterion;
- separate measured or proved premises from conjectural premises;
- include relevant failed routes and smallest known edge cases;
- ask one falsifiable question, preferably answerable by a proof, counterexample, exact bound, or
  sharply named missing lemma;
- request an explicit verdict, numbered claims, assumptions used, derivation, edge cases, and scope
  boundary;
- remove paths, “as before,” attached-file references, and any dependence on hidden context.

Compress background; do not compress the problem. A long prompt is justified only by information
the thinker truly needs to reconstruct the question.

## 3. Write the attack plan before seeing the answer

In `validation-plan.md`, pre-register the checks that could prove the appealing answer wrong:

- premise re-checks and dimensional or type checks;
- smallest examples, boundary cases, adversarial constructions, and negative controls;
- an independent derivation or exact re-plug where possible;
- the stop condition that would abandon this route.

This file stays project-side. Change its status to `FROZEN_BEFORE_RESPONSE` and remove the template
comments. Once prepared, do not edit it. Checks invented after reading the response are welcome;
label them `POST_RESPONSE` in the synthesis finding rather than rewriting history to make them look
pre-registered.

Seal both files only when they are genuinely ready:

```sh
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" prepare --id <round-id> --root .
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" prepare --id <round-id> --apply --root .
```

Give the operator exactly the sealed `prompt.md`, then stop. Do not claim that Promptus dispatched
anything, and do not continue as if an answer had arrived.

## 4. Preserve the return before interpreting it

When the operator returns the response, prefer the original attachment. For a pasted response,
save a faithful transcript without editing, reformatting, or repairing it and declare `inline`.
The first line must be `ROUND_ID: <round-id>`.

Preview and then retain it:

```sh
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" receive \
  --id <round-id> --response <returned-file> --capture attachment --root .
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" receive \
  --id <round-id> --response <returned-file> --capture attachment --apply --root .
```

Use `--capture inline` for a pasted transcript. The tool preserves the exact bytes, detects a wrong
round, prompt echo, or duplicate, and routes a valid return through `kb-ingest` as
`lit:UNTRUSTED`. If it stops on one of those conditions, do not interpret the text as this round's
answer.

## 5. Attack the answer, not its tone

The raw response is a source of conjectures, never a citation of authority. Work through its
numbered claims one by one:

1. Restate each material claim narrowly enough to be true or false.
2. Check that it follows from the sealed premises rather than an imported assumption.
3. Reconstruct every load-bearing derivation independently.
4. Run the frozen refute-first checks before adding sympathetic tests.
5. Search for the smallest counterexample and test limiting cases.
6. Mark the claim `VALIDATED`, `REFUTED`, `UNRESOLVED`, or `OUT_OF_SCOPE`, with the actual evidence.

An elegant argument that fails one necessary check is refuted. A useful idea without a complete
check remains unresolved. A mixed answer should produce a mixed verdict, not an average confidence
score.

## 6. Store only what the project learned

Write one concise synthesis finding through `kb-add`, linked to the quarantine unit's stable id:

```sh
bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-add.ts" \
  --substrate finding --kind RESULT --status <VALIDATED-or-CONJECTURED> \
  --title "<what this round established>" \
  --rel derives-from:<quarantine-id> --root . < <synthesis-body.md>
```

The body should contain the claim-by-claim dispositions, decisive checks or counterexamples, the
scope of what survives, and the next project action. Use a project-valid status: if any
load-bearing step remains open, do not call the synthesis validated. The quarantined response
itself remains `lit:UNTRUSTED` forever; the linked finding is the main agent's auditable judgment.

Re-index and inspect the round:

```sh
bun "${CLAUDE_PLUGIN_ROOT}/scripts/kb-index.ts" --root .
bun "${CLAUDE_PLUGIN_ROOT}/scripts/thinker-round.ts" status --id <round-id> --root .
```

Proceed only as far as the surviving finding and the operator's existing authorization allow. A
thinker round never authorizes implementation, protected data access, experiments, publication,
commit, push, tag, or release.

## Recovery and truthfulness

- `status` is read-only and can be run at any time.
- If the sealed prompt or validation plan changes, stop: the receipt no longer describes what was
  sent. Start a new round instead of silently resealing history.
- If intake was interrupted after the exact response was retained, inspect status and the retained
  hashes before retrying; never overwrite different bytes.
- `.promptus/thinker/INDEX.md` and each `ROUND.md` are derived. The prompt, plan, exact response,
  quarantine unit, and receipts are the evidence.
- The thinker exchange is not a fifth store and is not retrieved as project knowledge. Only normal
  Promptus units enter the knowledge graph.
