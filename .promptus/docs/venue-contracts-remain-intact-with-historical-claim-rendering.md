---
id: finding-20260905T003422Z-venue-contracts-remain-intact-with-historical-claim-rendering
substrate: finding
kind: RESULT
status: VALIDATED
created: "2026-09-04 20:34:22"
relations: ["supersedes:finding-20260823T125216Z-editio-general-venue-contracts-and-neurips-adapter"]
links: [editio-general-venue-contracts-and-neurips-adapter, canonical-grounding-makes-the-isolated-manuscript-continuation-p]
artifacts: [venue-profile|editio/templates/venues/neurips/venue.json|ad70ebc7f28aada1e00052be9afd3f6f099970872485c78862df270b30374e9b, scaffold|editio/scripts/editio-scaffold.ts|1bb9f0bfc21266d9115728b687d38522c293c6359fc4a0b03e01cd65e1d75f0e, doctor|editio/scripts/editio-doctor.ts|7a8865cf29d78483de8bd46edd563d4ea8cec6b52f9847c609098dc826432e57, renderer|editio/scripts/editio-render.ts|08acef22849e4a8658f5d88b6ea6b12d71a1784ca899f1822ba5d311e5abebed]
---
# Venue contracts remain intact with historical claim rendering

Editio retains the project-agnostic venue contract and NeurIPS Main Track adapter described in [[editio-general-venue-contracts-and-neurips-adapter]]. The venue profile, scaffold and doctor are byte-identical to that validated snapshot. The renderer now additionally maps explicitly historical claims to the existing grey claim macro and labels their grounds historical; it does not change venue ordering, package options, checklist requirements, asset verification or page-budget logic. The full candidate suite passed 386 tests / 2,137 expectations, including existing venue/template/render regressions, and both plugin adapters validate. This tranche did not rerun an official-style PDF compilation: the earlier three-mode compilation remains historical evidence, not a newly repeated result. No venue kit is vendored and no project-specific content was added. This successor carries all four artifact dependencies, updating only the reviewed renderer hash; it does not retract earlier venue capabilities or compilation facts. See [[canonical-grounding-makes-the-isolated-manuscript-continuation-p]] for the new grounding and historical-reporting contract.

Related: [[editio-general-venue-contracts-and-neurips-adapter]] · [[canonical-grounding-makes-the-isolated-manuscript-continuation-p]]
