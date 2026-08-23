---
id: finding-20260823T125216Z-editio-general-venue-contracts-and-neurips-adapter
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-08-23 08:52:16"
relations: ["supersedes:finding-20260812T014306Z-editio-nmi-profile-and-data-driven-venue-budgets"]
links: [lit-20260823T123842Z-neurips-2026-main-track-formatting-and-anonymity, lit-20260823T123847Z-neurips-mandatory-checklist-and-back-matter-order, lit-20260823T123855Z-neurips-2026-official-author-kit-contract, event-20260823T123903Z-keep-editio-venue-adapters-project-agnostic]
artifacts: [venue-profile|editio/templates/venues/neurips/venue.json|ad70ebc7f28aada1e00052be9afd3f6f099970872485c78862df270b30374e9b, scaffold|editio/scripts/editio-scaffold.ts|1bb9f0bfc21266d9115728b687d38522c293c6359fc4a0b03e01cd65e1d75f0e, doctor|editio/scripts/editio-doctor.ts|7a8865cf29d78483de8bd46edd563d4ea8cec6b52f9847c609098dc826432e57, renderer|editio/scripts/editio-render.ts|d985bc10b251a63e4cdb3d1def6f07b49cdc39a53bdc7ec68110426e0497ebdd]
---
# Editio general venue contracts and NeurIPS adapter

Editio now has a project-agnostic venue-adapter contract and a NeurIPS Main Track profile sourced from the official 2026 instructions and kit. Venue data maps Editio modes to official package options, places optional acknowledgements and appendices around the bibliography, requires a checklist tail, verifies external venue assets, and distinguishes content pages from exempt back matter. A fresh generic workspace compiled in draft, blind, and publish modes against the unmodified official style; the doctor rejected the untouched checklist and passed strictly after its TODOs were completed. Validation: 115 Bun tests with 745 expectations, marketplace/plugin validation, and diff hygiene. No official kit file is vendored, and no project-specific scientific content or workflow is encoded.

Related: [[lit-20260823T123842Z-neurips-2026-main-track-formatting-and-anonymity]] · [[lit-20260823T123847Z-neurips-mandatory-checklist-and-back-matter-order]] · [[lit-20260823T123855Z-neurips-2026-official-author-kit-contract]] · [[event-20260823T123903Z-keep-editio-venue-adapters-project-agnostic]]
