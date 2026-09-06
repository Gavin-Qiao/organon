// Isolated Node worker: QMD's llama.cpp binding probe times out under this Bun build.
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

globalThis.fetch = async () => { throw new Error("engine benchmark is offline; stage models explicitly first"); };
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
        await store.update();
        result = await store.embed();
        if (result.errors) throw new Error(`QMD embedding failed: ${JSON.stringify(result)}`);
      } else if (request.action === "query") {
        result = await store.searchVector(request.query, { limit: 100 });
      } else if (request.action === "update") {
        result = await store.update();
      } else if (request.action === "close") {
        await store?.close(); store = undefined;
        process.stdout.write(JSON.stringify({ id: request.id, result: null }) + "\n");
        break;
      } else throw new Error(`unknown action: ${request.action}`);
      process.stdout.write(JSON.stringify({ id: request.id, result }) + "\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({ id: request.id, error: String(error) }) + "\n");
    }
  }
} finally { await store?.close(); }
