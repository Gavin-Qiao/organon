---
id: finding-20260702T213709Z-skills-not-stacks
substrate: finding
kind: CONCEPT
status: CONJECTURED
created: "2026-07-02 17:37:09"
links: [editio-paper-read-port]
---
# Skills, not stacks

editio ships portable expertise and conventions, not a fixed toolchain. The SKILL is the deliverable; every bundled script is a thin, swappable reference implementation behind a stable interface; the user defines the concrete stack — the md-to-tex renderer, the plotting library, the TeX distribution, the venue class — as documented prerequisites, never vendored, never hard-required. Nothing in [[editio-paper-read-port]] reads "you must use tool X"; it reads "here is how to do this well; wire it to your tools". Rationale: skills travel, stacks don't — a hard tool dependency turns expertise into an installation problem, and the durable value survives any single tool's replacement. It is the store's script-over-server division applied to writing: judgment and conventions in the skill, mechanics behind a swappable seam. CONJECTURED until a real stack swap (renderer or plotting library) costs no SKILL edits.

Related: [[editio-paper-read-port]]
