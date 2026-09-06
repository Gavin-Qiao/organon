---
id: finding-20260905T013019Z-optional-qmd-recall-passes-isolated-offline-integration-with-gua
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-04 21:30:19"
links: [finding-20260905T005525Z-fresh-workload-trials-favor-qmd-as-an-optional-semantic-route]
artifacts: [sdk-receipt|benchmarks/results/semantic-adapter-sandbox-2026-09-04.json|0ad9a590a9f358aba60987f41fc893974e9b2e30a15c84ba68d5ef3b6b702987, sdk-receipt|benchmarks/results/semantic-adapter-local-sdk-2026-09-04.json|00bcb3cd2ec42d361bb74542f24dfbc651123e70c128c25e6f4292a861cbbf26, sdk-receipt|benchmarks/results/semantic-adapter-hardened-sandbox-2026-09-04.json|1e18557786aa2d63a5dc11ff59461211360c6804e13fada4ab5bdd33929b9701, sdk-receipt|benchmarks/results/semantic-adapter-final-sandbox-2026-09-04.json|d0d9e8416378dae2922303c8716885bd7445815616890a776baf2c0e1a0630c1]
---
# Optional QMD recall passes isolated offline integration with guarded fallback

The optional QMD adapter is implemented as a candidate, not released or installed. It follows [[finding-20260905T005525Z-fresh-workload-trials-favor-qmd-as-an-optional-semantic-route]]: lexical stays default, with explicit conceptual recall through kb-find --semantic. Search candidates never establish truth or absence.

The adapter reuses canonical parsing and effective lifecycle resolution, projects bounded units into a project-local disposable cache, filters status/substrate/archive collections before limiting, and binds exact returned qmd://collection/file identities to canonical source paths. Configuration separately binds staged QMD 2.8.3, Node >=22 and local embedding model bytes. Receipt checks bind source, configuration, model and fully closed database bytes. Exact quoted/required/all controls remain lexical; absent/stale/failed semantic state falls back to fresh lexical source with a diagnostic. No implicit installation, download, resident server or live-project access occurred.

Initial prototype attempts stalled. Four interrupted fixture caches remain at /tmp/promptus-continuity-nbI9uo, /tmp/promptus-continuity-tLysFV, /tmp/promptus-continuity-UIaDcM and /tmp/promptus-continuity-bOpD55; those attempts were interrupted before durable JSON output and are not successes. Their interrupted locks must not be treated as current indexes. The old benchmark Bun-to-Node stdin failure was real, but did not explain every new stall: QMD's chunk tokenizer separately selects an embedding model, so a per-store model setting alone could reach an unstaged default. Explicitly setting QMD_EMBED_MODEL alongside the store model, request-file exchange and disabled native downloads allowed real SDK execution in the ordinary sandbox. No IPC permission exception is required by the final trial.

The fresh GPT-6 read-only auditor exposed hard-linked projection writes, basename-only result binding and unchecked SQLite sidecars. These are corrected by rejecting multi-link/special cache files, requiring exact eligible provider URIs, and rejecting/rebuilding sidecar-bearing generations. The re-audit found malformed receipt JSON prevented recovery; malformed/unreceipted database state now rebuilds. Post-worker source and model checks prevent racing refreshes from publishing usable receipts. Model changes use distinct database generations rather than reusing vectors keyed only by the same file path.

All four completed real-SDK receipts report passed=true and unchanged evaluated adapter inputs. Each contains ten steps: configure, build, current query, historical status query, new CLI process, unchanged refresh, explicit gated addition, stale fallback, incremental refresh and a new CLI query of the addition. Their read-only phases preserve exact source hashes. The final ordinary-sandbox fixture is /tmp/promptus-continuity-4OeDEG; earlier successful fixtures remain intact. Thirteen SDK-double tests (68 expectations) independently exercise contracts including stale/racing state, exact controls, filters/graph, archive movement/deletion/restart, unsafe links, corruption and model changes. These are not real embedding-quality measurements. Full candidate tests: 404 pass, 0 fail, 2232 expectations, 35 files; both plugin adapters and reader parity pass, as do modified skill validators and non-empty Unreleased checks.

The final SDK trial exercises addition and restart, not comprehensive actual-backend deletion/archive/model replacement or physical vector erasure. Fresh-agent use of the optional route, broader interrupted-work continuity, packaging/migration and the full OVERHAUL.md matrix remain open. Live Psi, MoT, Probatio and Mensura stores and all installed plugins remain untouched.

Related: [[finding-20260905T005525Z-fresh-workload-trials-favor-qmd-as-an-optional-semantic-route]]
