---
id: finding-20260905T014552Z-instruction-and-package-audit-removes-scope-conflicts-without-re
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-04 21:45:52"
links: [finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua]
---
# Instruction and package audit removes scope conflicts without rewriting project evidence

A fresh GPT-6 source-contract auditor inspected root policy, both plugin entrypoints/manifests, Promptus resume/init/checkpoint/recording instructions and hooks, and Editio workflow/gates. Parent inspection confirmed five concrete conflicts: initial cadence copying could replace an existing AGENTS.md; the doctor workflow and native wrapper demanded a blanket stop despite authorized independent work; recording instructions mandated checkpoint re-distillation/archive by line count; Editio's downstream steps could scaffold during status or build a PDF for a render-only task; and auto-index guessed writer intent from a Bash command but indexed hook cwd rather than explicit --root.

Correct the instructions at their existing entrypoints. Initialization preserves and integrates existing instructions; preflight blocks affected-state trust without granting new write authority; checkpoints preserve unrecorded knowledge rather than trigger general archives; paper creation and PDF builds depend on the request. Skill-creator guidance favors these narrow outcome/scope corrections, not added universal procedures.

Remove the shell-detecting PostToolUse auto-index hook and its source from both adapters. Gated writers retain their catalog behavior and explicit target-bound next action; batch kb-index or promptus-check owns derived refresh. This removes wrong-root guessing and duplicate per-call work without pretending native shell-hook normalization is verified. SessionStart, protection and checkpoint prompting remain. Quantitative batch timing is still pending. The removed hook is recoverable in git history; no installed cache was touched.

Editio now resolves explicitly cited archived pages/ledger entries with canonical lifecycle, rather than filtering cold units before resolution. Archiving is a location/scope change, not validation or refutation. A new regression proves live-to-archive supersession, archived still-validated support, archived refuted historical reporting and rejection of superseded positive support.

Two isolated package tests (37 expectations) copy the plugin trees, verify manifest/skill presence, explicit-root lexical recall, no-configuration semantic fallback without creating a model cache, bounded body retrieval, standalone Editio gates/rendering after removing the temporary sibling Promptus, and a legacy namespace dry run, exact-byte migration, retrieval and idempotence. Initial test failures came from putting --root before the doctor's positional action (it ran check instead of migrate), not a demonstrated migration defect; the runner now passes the action first. The fixture explicitly uses legacy schema3 rather than current-schema custom paths.

Full current suite:407 pass/0fail,2272 expectations,36 files. Both plugin manifests and reader parity validate; revised skills validate. MIGRATION.md covers compatibility, explicit batch maintenance, optional models, historical-grade rollback and future release/install authority. These are Linux package execution tests and source-contract review, not certification of desktop hook delivery, Windows/macOS native models, every specialized skill, or real TeX builds. The full OVERHAUL.md matrix remains open. No live research store was accessed.

Related: [[finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua]]
