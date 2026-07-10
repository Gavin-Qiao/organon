---
id: finding-20260710T014245Z-one-portable-core-two-thin-host-adapters
substrate: finding
kind: CONCEPT
status: VALIDATED
created: "2026-07-09 21:42:45"
relations: ["extends:skills-not-stacks", "supports:the-gate"]
links: [skills-not-stacks, the-gate]
---
# One portable core, two thin host adapters

Host support belongs at the edge. Organon's TypeScript scripts, markdown stores, vocabulary, and reasoning skills remain one portable core. Claude Code and Codex each get only the discovery surfaces and lifecycle translations their host requires: marketplace and plugin manifests, command-to-skill adapters, and hook event/payload maps.

The native Codex path is validated structurally and by an isolated install of both plugins. The same gate blocks Claude Write/Edit payloads and Codex apply_patch payloads; Codex PreCompact replaces the unavailable SessionEnd lifecycle. This extends [[skills-not-stacks]] while preserving [[the-gate]]: duplicate business logic would create two systems that drift.

Related: [[skills-not-stacks]] · [[the-gate]]
