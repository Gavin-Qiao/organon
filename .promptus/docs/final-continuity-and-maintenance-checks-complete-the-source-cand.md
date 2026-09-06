---
id: finding-20260905T020242Z-final-continuity-and-maintenance-checks-complete-the-source-cand
substrate: finding
kind: CLAIM
status: VALIDATED
created: "2026-09-04 22:02:42"
links: [event-20260905T014633Z-verify-semantic-mutations-and-package-boundaries-while-retaining]
artifacts: [completion-receipt|benchmarks/results/continuation-failure-fixture-2026-09-04.json|0c164d226f2ca0364781d230826cf5ad93c794a9e35a8d9716d74c3728507660, completion-receipt|benchmarks/results/gpt6-interrupted-continuation-2026-09-04.json|e62fc9a590dc26457fdf7a0f0f6227e8c44c71e0ee69235e8868d654fad4cee2, completion-receipt|benchmarks/results/batch-maintenance-2026-09-04.json|2bc836225320fe178b15fede3d9cfd045aabda6e69393c7a1cc300895741079c]
---
# Final continuity and maintenance checks complete the source candidate

The source candidate now has evidence across the entire [[event-20260905T014633Z-verify-semantic-mutations-and-package-boundaries-while-retaining]] frontier, with final scope audit in OVERHAUL-VERIFICATION.md.

A fresh GPT-6 agent resumed an isolated fixture with the raw NB-42 artifact removed from scope and a started checkpoint showing0/4 batches but no completed output. It did not infer a live process from that checkpoint, fabricate results, rerun work or restore missing inputs. It completed work/readiness.md, appended one RESUME/OPEN record and refreshed NOW. Parent verification independently checks all8 old bodies:7 canonical slices exactly match, while the former last ledger slice matches exactly after restoring the relocated append sentinel. This is delimiter framing, not a rewritten evidence body. Readiness is hash-bound in the verification receipt. Freshness/graph pass; strict health and live artifact preflight correctly remain red with the original raw artifact absent. The partial result remains absent. This is one synthetic task, not a causal benchmark or external process-liveness proof.

A deterministic test also spawns a writer, waits for its exact lease acquisition, terminates that specific fixture process and waits for its terminal event. Existing source remains byte-identical, another writer times out rather than clearing the lease, and recovery succeeds only after explicit removal of that exact terminal owner's lock. Concurrent24-event and12-alias regressions still pass.

The batch comparison alternates three runs per mode. Each starts with508 synthetic units, adds20 independent events, writes NOW, runs strict health and a live artifact preflight. All120 events across six runs survive with original bodies preserved and all end states ready. Median total time is2408.267ms with per-write indexing and1054.531ms with explicit batch maintenance, about2.28x or56.2% lower wall time. This measures the selected local Linux process cadence, excluding construction and host-hook dispatch overhead; it is not a live-project speedup claim.

The final specialized GPT-6 instruction audit read thinker/trajectory/grannie/ingest/Telos, structure/figures/LaTeX/numbers and grounding workflows plus relevant references. It found manual provenance/CITE instructions, an insufficient body-read requirement in the writing reviewer, and a preview wrapper missing shared definitions. Parent corrections route metadata through kb-amend, distinguish search coverage from inspected support, and bundle a preview that loads numbers/macros/identity. A real pdflatex test passes all4 assertions. The authoring-subset reference now documents historical grades and the actual override boundary; Telos initialization preserves existing AGENTS. No new defect was identified in thinker custody, trajectory instructions or number binding within that bounded audit.

Full final suite:409 pass/0fail,2284 expectations,37 files. Both adapters and reader parity validate; affected skills and Unreleased sections validate; git diff --check and64 JSON files pass. Six immutable public/synthetic engine receipts exceed500KiB, largest5.8MB; the size gate now exempts exactly those dated filenames while retaining the default everywhere else. Their original bytes and recorded hashes remain intact; no model/runtime/private corpus is vendored.

OVERHAUL-VERIFICATION.md maps every required candidate area to evidence and limitations. Source implementation is complete; release/installation/live-project rollout are separate operator decisions. No commit, push, tag, release, installation or access to Psi/MoT/Probatio/Mensura occurred. Broader cross-OS native-model and desktop hook execution are not claimed by these Linux source/package checks.

Related: [[event-20260905T014633Z-verify-semantic-mutations-and-package-boundaries-while-retaining]]
