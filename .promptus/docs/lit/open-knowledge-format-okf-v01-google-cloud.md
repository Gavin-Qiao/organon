---
id: lit-20260630T063445Z-open-knowledge-format-okf-v01-google-cloud
substrate: lit
kind: NOTE
status: CITE
created: "2026-06-30 02:34:45"
source: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"
---
# Open Knowledge Format (OKF) v0.1 - Google Cloud

Google Cloud's Open Knowledge Format (OKF) v0.1 (Sam McVeety and Amir Hormati, 2026-06-12; blog + spec). A vendor-neutral open spec for agent-readable knowledge: a directory of markdown files with YAML frontmatter, the only required field being `type`; standard markdown links between concepts (UNTYPED, with the relationship living in prose; broken links are explicitly tolerated as "not-yet-written knowledge"); reserved index.md (per-directory listing for progressive disclosure) and log.md (date-grouped change history); a numbered `# Citations` convention. Deliberately minimal: it standardizes interchange and declines discipline, with no epistemic status or claim-state, no write gate, and no typed relations. Repo GoogleCloudPlatform/knowledge-catalog carries okf/SPEC.md, sample bundles, a reference enrichment agent, and a static HTML visualizer.
