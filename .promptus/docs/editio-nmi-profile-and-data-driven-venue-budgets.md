---
id: finding-20260812T014306Z-editio-nmi-profile-and-data-driven-venue-budgets
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-11 21:43:06"
links: [lit-20260812T013956Z-nature-machine-intelligence-article-limits-and-structure, lit-20260812T014014Z-nmi-initial-formatting-and-optional-anonymization, lit-20260812T014127Z-nature-final-artwork-dimensions-and-typography]
artifacts: [venue-profile|editio/templates/venues/nmi/venue.json|caeaf62234ab05b980b251f7657a972bc465d12e8a8c8a352c1ac017a5451234, budget-engine|editio/scripts/editio-doctor.ts|78284d470e41779013e63b8fdb2eefb22a798a4e4f97f31adade1a0edc64aadc]
---
# Editio NMI profile and data-driven venue budgets

Editio now models venue constraints through data instead of equating every venue with a page limit. The NMI Article profile carries the journal order and heading policy, enforceable main-text/abstract/display-item limits, advisory reference guidance, and production artwork dimensions while stating that its generated standard-LaTeX document is only an initial-review proxy. Fresh scaffolds persist the requested venue and that venue’s default order, removing the prior immediate-drift failure. The result is validated by 109/109 Bun tests, plugin/skill validators, and a real latexmk plus strict-doctor smoke build.

Related: [[lit-20260812T013956Z-nature-machine-intelligence-article-limits-and-structure]] · [[lit-20260812T014014Z-nmi-initial-formatting-and-optional-anonymization]] · [[lit-20260812T014127Z-nature-final-artwork-dimensions-and-typography]]
