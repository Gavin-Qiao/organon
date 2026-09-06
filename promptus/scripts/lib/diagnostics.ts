/** Recovery advice never grants write authority or promotes scientific evidence. */
import { join } from "node:path";

export function recoveryFor(code: string, root: string) {
  const cache = join(root, ".promptus/cache"), ledger = join(root, ".promptus/ledger/RESEARCH-LEDGER.md");
  if (/ARTIFACT|THINKER/.test(code)) return {
    surface: "evidence", paths: [join(root, ".promptus")],
    recovery: "Inspect the named evidence dependencies and their source owners; obtain or correct evidence only with scoped authority. Reindexing cannot restore missing scientific evidence. Archival warnings do not invalidate unrelated current claims.",
    automaticRepair: false,
  };
  if (/COLLISION|ALIAS.*BROKEN|HARD_INTEGRITY|IDENTITY/.test(code)) return {
    surface: "identity", paths: [join(root, ".promptus")],
    recovery: "Fetch the colliding or unresolved source units, disambiguate their stable IDs/aliases, and propose a gated correction. Do not guess an identity or edit the derived index to hide it.", automaticRepair: false,
  };
  if (/HANDOFF|SENTINEL/.test(code)) return {
    surface: "handoff", paths: [ledger],
    recovery: "Inspect the configured ledger and latest event. Refresh NOW through kb-now only after recovering the actual frontier; sentinel repairs require explicit source scope. Unrelated authorized work may continue.", automaticRepair: false,
  };
  if (/SEMANTIC|OPTIONAL/.test(code)) return {
    surface: "optional-retrieval", paths: [join(cache, "semantic")],
    recovery: "Use lexical retrieval. Inspect the explicit local runtime/model configuration; refresh the optional projection only when requested. Do not download or install implicitly.", automaticRepair: false,
  };
  if (/CACHE|SEARCH|CATALOG|HEALTH_(?:RECEIPT|INDEX)/.test(code)) return {
    surface: "derived-retrieval", paths: [cache],
    recovery: "Wait for any active writer, inspect source, then run promptus-check --strict --root <this project> when derived refresh is authorized. This does not repair missing evidence or change scientific status.", automaticRepair: false,
  };
  return { surface: "source-policy", paths: [join(root, ".promptus")],
    recovery: "Inspect the named source/policy condition and report its scope. Preserve inherited debt; do not auto-migrate, baseline or repair unrelated records.", automaticRepair: false };
}
