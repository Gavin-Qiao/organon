---
id: lit-20260702T213742Z-doco-and-deo-spar-document-ontologies
substrate: lit
kind: NOTE
status: CITE
created: "2026-07-02 17:37:42"
source: "https://sparontologies.github.io/doco/current/doco.html"
links: [editio-structure-gate]
---
# DoCO and DEO (SPAR document ontologies)

DoCO, the Document Components Ontology, describes what a scholarly document is made of (Section, Paragraph, Figure, Table, Formula, Abstract, Appendix, BibliographicReferenceList); it imports DEO, the Discourse Elements Ontology (https://github.com/sparontologies/deo), which names what each part does rhetorically (Introduction, Background, Methods, Results, Discussion, Conclusion, RelatedWork, FutureWork, Contribution). Both are SPAR ontologies — the same family as CiTO and aligned with PROV-O, which kb-export already emits — so adopting them for the [[editio-structure-gate]] keeps structure, citation intent, and provenance on one stack. The class inventory in templates/editio/schema/doco-deo.json is taken from the published DoCO spec.

Related: [[editio-structure-gate]]
