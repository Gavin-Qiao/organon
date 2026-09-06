---
id: finding-20260905T000713Z-fresh-gpt-6-packet-readers-preserve-answers-under-shorter-recall
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-09-04 20:07:13"
links: [gpt-6-guidance-favors-precise-instructions-and-calibrated-comple, provencher-recommends-revisiting-accumulated-agent-scaffolding]
artifacts: [fresh-agent-replay|benchmarks/results/gpt6-continuity-replay-2026-09-04.json|bd08b1bd5f502b2ebb2aa8c686a4049ba46deddf28729ec76797e963183da8d5]
---
# Fresh GPT-6 packet readers preserve answers under shorter recall instructions

At the operator's direction, two fresh-context gpt-6-astra agents read identical synthetic Northbridge packets, one with the committed recall skill and one with the shorter candidate. Each agent was authorized to read only its instruction snapshot and packet file; expected answers and the other arm were withheld. Both selected the correct choice in all seven answerable packets and abstained on the unsupported question. The strict evidence-list scorer passed 6/7 baseline responses and 7/7 candidate responses. The baseline's only failure listed a superseded unit while its answer and final explanation correctly recognized supersession; the response schema cannot distinguish historical context from supporting evidence. The candidate instruction file was 1,989 bytes versus 3,597 bytes in the baseline. This one-agent-per-arm pilot measures packet interpretation, not discovery, autonomous retrieval, operational continuation, manuscript writing, or real-project effectiveness. Shared platform instructions remain present. It provides an initial regression check, not causal evidence that the instruction change improves GPT-6. The eighth continuity-suite case is a deterministic provenance trace, not an agent-answer case. Official GPT-6 guidance and Provencher's article motivate narrower, conditional instructions; our empirical claim is limited to these observed answers.

Related: [[gpt-6-guidance-favors-precise-instructions-and-calibrated-comple]] · [[provencher-recommends-revisiting-accumulated-agent-scaffolding]]
