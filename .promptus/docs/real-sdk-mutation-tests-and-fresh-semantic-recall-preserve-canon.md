---
id: finding-20260905T014551Z-real-sdk-mutation-tests-and-fresh-semantic-recall-preserve-canon
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-04 21:45:51"
links: [finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua]
artifacts: [trial-receipt|benchmarks/results/semantic-adapter-mutations-2026-09-04.json|11b6371c27be4cc640d8083125e5b5d317beccb839da093882ced81042ecea7a, trial-receipt|benchmarks/results/semantic-adapter-mutations-copy-inspection-2026-09-04.json|e7b464b120765f966efa23161c2008f030e5b9b9faa0b2cf0a0f454f08de9177, trial-receipt|benchmarks/results/semantic-adapter-mutations-empty-collection-fix-2026-09-04.json|6719619f8520dd99be45b0f3512031bdbf7ef06255d4fe21bb1464b9e8dd139b, trial-receipt|benchmarks/results/gpt6-semantic-continuation-2026-09-04.json|1a4fbdc26f243d2342f24e66a99ac5e7f09fb8856e76e51c33d9df0bbe90b0d9]
---
# Real SDK mutation tests and fresh semantic recall preserve canonical evidence

Following [[finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua]], extend the real SDK trial beyond additions to same-ID body editing, refutation, archiving and deletion, with new CLI processes. The v2 harness binds its own bytes as well as adapter code and checks actual current indexed bodies plus embedding-row presence.

The first expanded run failed because its readonly SQLite inspection created WAL sidecars, correctly rejected by the adapter. The inspection now uses an isolated byte copy. The second failed after deletion: QMD SDK removeCollection removes store_collections metadata but does not deactivate documents. Parent inspection of the staged SDK index.js/store.js confirmed this distinction. The adapter now supplies emptied projection directories to QMD update before removing their collection configuration. This uses the existing updater, not new SQL mutation logic. Original failures and fixtures remain intact.

The corrected real SDK run passes all14 steps. Same-ID edited content matches the projected source, has no prior probe token, has at least one embedding row, and ranks first for the changed orchard question. Gated REFUTED status removes the unit from default scope while explicit status finds its canonical ID. Archive movement requires history and returns the archive path; deletion removes active stored rows and results, including after restarting the CLI. No assertion guarantees physical erasure of unreachable vectors or independently recomputes embeddings. Successful retained fixture: /tmp/promptus-continuity-Z4ZZaL. Failed fixtures: vNSbwI and 05HhAY under the same prefix.

Fresh GPT-6 agent gpt6_semantic_continuation used candidate recall on the earlier synthetic /tmp/promptus-continuity-4OeDEG fixture without prior outcomes. It recovered coefficient17, checksum7f3c and batch limit4, rejected the superseded coefficient11 route, described the fictional alarm and did not assert real ocean validation. It diagnosed stale ordinary catalog/search despite a fresh NOW marker, fetched bodies and verified the raw artifact, without source repairs. Some concurrent semantic queries fell back explicitly while the cache lease was held. The parent independently rehashed all10 source files: df54021560816f3b81f361e4131afe3206e210093ea30f8ee0a43f16f89fd733 before and after. Tool routes are agent-reported, not a complete transcript. This is one unreplicated pilot, not proof of general behavior gain.

No live projects, installed plugins or global models changed. Remaining missing-artifact/interrupted-work behavior and final overhaul audit are not discharged by these tests.

Related: [[finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua]]
