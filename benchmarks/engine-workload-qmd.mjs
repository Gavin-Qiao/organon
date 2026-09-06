// Offline QMD worker for isolated workload trials. A persistent Node process is
// needed because the native model probe does not complete in the tested Bun host.
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
globalThis.fetch = async () => { throw new Error("offline trial: network disabled"); };
let store;
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    try {
      let result;
      if (request.action === "open") {
        const { createStore } = await import(pathToFileURL(join(request.dependencies, "node_modules/@tobilu/qmd/dist/index.js")).href);
        store = await createStore({ dbPath: request.dbPath, config: {
          collections: { units: { path: request.corpus, pattern: "**/*.md" } },
          models: { embed: request.model },
        } });
        result = { opened: true };
      } else if (request.action === "query") {
        result = await store.searchVector(request.query, { limit: 100 });
      } else if (request.action === "body") {
        result = await store.getDocumentBody(`qmd://units/${request.unitId}.md`);
      } else if (request.action === "update") {
        const update = await store.update();
        const embed = await store.embed();
        if (embed.errors) throw new Error(`embedding failed: ${JSON.stringify(embed)}`);
        result = { update, embed };
      } else if (request.action === "close") {
        await store?.close(); store = undefined;
        process.stdout.write(JSON.stringify({ id: request.id, result: null }) + "\n");
        break;
      } else throw new Error(`unknown action: ${request.action}`);
      process.stdout.write(JSON.stringify({ id: request.id, result, rssBytes: process.memoryUsage().rss }) + "\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({ id: request.id, error: String(error) }) + "\n");
    }
  }
} finally { await store?.close(); }
