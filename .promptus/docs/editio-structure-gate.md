---
id: finding-20260702T213742Z-editio-structure-gate
substrate: finding
kind: CONCEPT
status: CONJECTURED
created: "2026-07-02 17:37:42"
links: [the-gate, editio-paper-read-port, doco-and-deo-spar-document-ontologies]
---
# editio structure gate

Manuscript structure goes through a gate exactly like store writes: templates/editio/schema/doco-deo.json maps every section to a DEO or DoCO class from a closed core plus a blessed extended set, policy strict — no ad-hoc sections — with archetype orders (imrad, cs-systems, theory) and the render modes in the same file. It is [[the-gate]]'s core/extended/policy pattern reused verbatim on a new axis: kb-vocab.json gates what enters the store; doco-deo.json gates what a paper of [[editio-paper-read-port]] is made of. Grounding is the SPAR family ([[doco-and-deo-spar-document-ontologies]]): DoCO for components, DEO for discourse roles — the same stack as the CiTO and PROV-O that kb-export already emits, so structure, citation intent, and provenance stay on one consistent ontology. Tune extended and add venue orders per project. CONJECTURED until a real section set passes the gate and builds (the Phase 2 done-when).

Related: [[the-gate]] · [[editio-paper-read-port]] · [[doco-and-deo-spar-document-ontologies]]
