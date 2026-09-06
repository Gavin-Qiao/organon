# Release and adoption status

Verified on 2026-09-06. Publication and Codex installation are complete. Adoption by all four
running research projects is **not** complete; no shared installation proves a session reload.

## Published and installed

| Plugin | Release | Exact merged/tagged commit | Release PR | Publication check |
| --- | --- | --- | --- | --- |
| Promptus | [0.10.0](https://github.com/Gavin-Qiao/organon/releases/tag/promptus-v0.10.0) | `504ded3c98f5494519ec1e45b2a1db853cf15ab3` | [#58](https://github.com/Gavin-Qiao/organon/pull/58) | [Passed](https://github.com/Gavin-Qiao/organon/actions/runs/34014163330) |
| Editio | [0.8.0](https://github.com/Gavin-Qiao/organon/releases/tag/editio-v0.8.0) | `f5fa92bc9165f12017f8e322c45bc22d601614f4` | [#59](https://github.com/Gavin-Qiao/organon/pull/59) | [Passed](https://github.com/Gavin-Qiao/organon/actions/runs/34014502815) |

Implementation and all README/usage-guide changes landed through
[#57](https://github.com/Gavin-Qiao/organon/pull/57). Both release cuts passed the complete
478-test suite, adapter/reader validation, strict Organon store health and configured hygiene.
Required Linux, macOS and Windows PR checks passed, as did each merged-main CI run.
Existing graph and archival evidence warnings remain visible; no debt baseline was introduced.

Both plugins were updated through `codex plugin add` using the already configured local Organon
marketplace. Installed records report enabled Promptus 0.10.0 and Editio 0.8.0, with both adapter
manifests agreeing. All 111 Promptus source files and all 60 Editio source files match the reviewed
packages byte-for-byte. Promptus has four additional Codex-generated command-adapter files;
Editio has no extra files. Prior version caches remain available. No installed cache was edited
by hand and no marketplace setting was changed. Claude CLI was unavailable in this environment,
so a Claude installation/update is not certified.

## Live-project boundary

Initial read-only, live-artifact preflights were ready for all four projects. Those observations
were point-in-time checks, not guarantees that another session would stop writing afterward.

| Project | Initial live units | Adoption outcome | Next safe action |
| --- | ---: | --- | --- |
| Psi | 6,515 | Two apply attempts refused changed source-bound tokens before refresh. A diagnostic preview also found derived-index lag. | Let the active session finish its batch/checkpoint, then obtain and apply a fresh plan. |
| MoT | 6,399 | Apply refused a changed token before refresh. A fresh diagnostic preview found derived-index lag. | Wait for the active writer's batch/checkpoint, then obtain and apply a fresh plan. |
| Probatio | 6,100 | Read-only preflight only. Its repository-owned runtime pins upstream 0.9.1 with a reviewed alias overlay. | Keep the pin; any vendored upgrade needs its own reviewed batch and overlay audit. |
| Mensura | 2,411 | Installed-package preview found `HANDOFF_STALE` and `CACHE_STALE`; no apply attempted. | Its owning session must checkpoint the actual frontier before a new adoption preview. |

No adoption attempt reached derived maintenance. This release session did not change any live
project's research Markdown, manuscript, vocabulary, custom instructions or derived indexes.
Other sessions did write research during these checks; whole-project hashes therefore changed
without indicating an Organon migration. No successful post-adoption continuation is claimed.

## Defaults and pickup

- Lexical retrieval remains the default. No database, model, semantic configuration or GPU is required.
- Persistent raw caching remains off; inspected project allowances and raw-cache sizes were zero.
- Existing project policies already require explicit indexing. They were not replaced when the
  shell-detecting post-command auto-index hook was removed.
- After current research sessions checkpoint, start new Codex tasks to load the installed skills
  and hooks. Preview and verify each project separately using the [upgrade guide](MIGRATION.md).
- Keep historical claim annotations in compatible Editio versions during rollback. Installation
  does not rewrite manuscripts or build PDFs.

The release is available now. The remaining work is coordinated adoption at a stable handoff,
not another retrieval experiment, a source migration, or silent evidence repair.
