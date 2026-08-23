# Validation plan — {{TITLE}}

**Round:** `{{ROUND_ID}}`  
**Status:** `DRAFT_BEFORE_RESPONSE`

This plan stays project-side. Freeze it with the outbound prompt and do not edit it after
preparation. Put checks invented after seeing the response in the synthesis finding, clearly
labelled `POST_RESPONSE`.

## Target and stop rule

<!-- State the exact unresolved target, what would close it, and what result would stop this route. -->

## Premise audit

<!-- List supplied premises and how the project will independently confirm or bound them. -->

## Refute-first checks

<!-- Pre-register counterexamples, edge cases, exact re-plugs, negative controls, or proof poisons. -->

## Claim adjudication

For every returned claim, record one disposition:

- `VALIDATED`: independently reconstructed from project evidence;
- `REFUTED`: an explicit counterexample or failed necessary check exists;
- `UNRESOLVED`: neither proved nor refuted;
- `OUT_OF_SCOPE`: not licensed by the sealed question.

The raw response remains `lit:UNTRUSTED` under every disposition. Accepted claims become separate
findings linked with `derives-from`.

## Authorization boundary

This round independently authorizes none of: implementation, protected source or outcome access,
experiments, publication, venue selection, commit, push, tag, or release.
