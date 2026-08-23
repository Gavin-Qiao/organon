---
id: finding-20260823T091529Z-stateless-thinker-rounds-require-independent-adjudication
substrate: finding
kind: METHOD
status: VALIDATED
created: "2026-08-23 05:15:29"
links: [report]
artifacts: [cli|promptus/scripts/thinker-round.ts|79ab06b633aed7f9a699b9815437235effdb578c7ca2461f1d76c3d72a7ab155, custody|promptus/scripts/lib/thinker.ts|79834a95abd064cd627fc79811e8c506dccfa52006bc1b32ec1b956ff42c76b6, workflow|promptus/commands/thinker-round.md|c81f8775d77f43b4576a376ef148109b5b38da6139db77d4a882d2ed6224763a, tests|promptus/scripts/test/thinker-round.test.ts|c680df335c366e554100802f30239368a7029881b3bab755d7ebbef10c100bf5, skill|promptus/skills/thinker-round/SKILL.md|029f2cff256819637e550a441d8a3390b6e1581a2b9a82822ba19fdbfe8437fd]
---
# Stateless thinker rounds require independent adjudication

Read-only inspection of MoT and Psi's long-running thinker histories established the same reusable boundary. Early lost responses and premature interpretation showed that custody must precede reasoning; a prompt echo and overconfident forecasts showed that polished output is not evidence. Later successful rounds sealed a self-contained prompt, preserved the return verbatim, quarantined it, and promoted only narrower claims reconstructed by the project.

The validated prompt-only contract is:

- invoke a round only at one decision-relevant theoretical bottleneck, after retrieving and trying the problem locally;
- give the stateless thinker one complete prompt and no workspace, tools, network, session history, prior response, or hidden files;
- freeze refute-first project checks before the response is seen;
- let the operator transport both directions; Promptus never claims dispatch or thinker identity;
- retain and byte-compare the returned regular-file snapshot before interpretation, then quarantine it as `lit:UNTRUSTED` with `source: external-thinker:<round>` and content/wrapper hashes;
- treat every returned claim as conjectural, reconstruct it independently, and put only the project verdict in a normal finding linked by `derives-from`;
- grant no implementation, protected access, experiment, publication, commit, tag, or release authority from a thinker verdict.

The reusable Organon implementation deliberately stays smaller than the project-specific machinery that inspired it. It has `draft`, `prepare`, `receive`, and `status`, not dispatch forms, close ceremonies, or an authorization matrix. It covers the prompt-only theoretical role; Psi's authenticated executable source-auditor packets remain a different workflow. Derived round readouts are not a fifth store.

The implementation is integrated with `kb-add`, `kb-index`, the migration doctor, the read-only session doctor, and `promptus-check`. It detects drift, path escape, symlink input, wrong-round returns, prompt echo, duplicate content, and interrupted intake; the last can resume only from the same retained bytes. Validation passed all marketplace/plugin checks, the skill validator, 10 focused lifecycle/adversarial tests, and the full 306-test repository suite.

Related: [[report]]
