// One-shot Node worker. File requests avoid host-specific Bun/Node stdin IPC.
// QMD supplies indexing, embeddings and vector search; Promptus owns provenance.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fork } from "node:child_process";
globalThis.fetch = async () => { throw new Error("Promptus semantic retrieval is offline; stage the local model explicitly"); };
async function ipcPreflight() {
  await new Promise((resolve, reject) => {
    const child = fork(new URL(import.meta.url), ["--ipc-probe"], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("QMD native runtime needs local child-process IPC; this host blocks it")); }, 2000);
    child.on("message", message => {
      if (message === "ready") child.send("ping");
      else if (message === "pong") { clearTimeout(timer); child.disconnect(); resolve(); }
    });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("QMD native runtime needs local child-process IPC; this host blocks it")); });
  });
}
async function main() {
const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
let store;
try {
  const manifest = JSON.parse(readFileSync(join(request.config.packageRoot, "package.json"), "utf8"));
  if (manifest.dependencies?.["node-llama-cpp"]) await ipcPreflight();
  const { createStore } = await import(pathToFileURL(join(request.config.packageRoot, "dist/index.js")).href);
  store = await createStore({ dbPath: request.dbPath, config: {
    collections: request.collections, models: { embed: request.config.model },
  } });
  let result;
  if (request.action === "update") {
    for (const collection of await store.listCollections()) if (!(collection.name in request.collections)) await store.removeCollection(collection.name);
    const update = await store.update();
    for (const group of request.retiredGroups ?? []) await store.removeCollection(group);
    const embed = await store.embed();
    if (embed.errors) throw new Error(`QMD embedding failed: ${JSON.stringify(embed)}`);
    result = { update, embed };
  } else if (request.action === "query") {
    result = await store.searchVector(request.query, { collection: request.groups, limit: request.limit });
    result = result.map(hit => ({ filepath: hit.filepath, score: hit.score }));
  } else throw new Error("unknown semantic worker action");
  writeFileSync(request.response, JSON.stringify({ result }), { flag: "wx", mode: 0o600 });
} catch (error) {
  writeFileSync(request.response, JSON.stringify({ error: String(error) }), { flag: "wx", mode: 0o600 });
  process.exitCode = 1;
} finally { await store?.close(); }
}
if (process.argv[2] === "--ipc-probe") { process.on("message", () => process.send?.("pong")); process.send?.("ready"); }
else await main();
