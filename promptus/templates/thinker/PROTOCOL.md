<!-- promptus:thinker-exchange v1 -->
# External thinker exchange

This directory is a governed custody surface for operator-mediated, stateless theoretical
reasoning. It is **not a fifth Promptus store** and is not searched by `kb-find`.

## Boundary

- The main project agent opens a round only at a precise unresolved theoretical boundary.
- The external thinker receives the exact sealed prompt and nothing else: no workspace, session
  history, network, tools, prior response, or hidden project context.
- The operator transports the prompt and response. Promptus does not claim to contact or identify
  the thinker.
- A returned response is preserved before interpretation and quarantined as `lit:UNTRUSTED`.
- The raw response never promotes itself. Independently reconstructed project claims enter through
  `kb-add` as separate findings with a `derives-from` relation to the quarantine unit.
- A thinker verdict grants no implementation, protected access, experiment, publication, or
  release authorization.

`INDEX.md` and each round's `ROUND.md` are derived read surfaces. The prompt, validation plan,
response, receipts, quarantine unit, and linked project findings carry the exchange evidence.
