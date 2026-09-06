/** Benchmark-only adapters. Source projection and semantic validity are caller-owned. */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { buildSearchIndex, searchIndex, searchTokens, type SearchSourceDocument, type SearchIndex } from "../promptus/scripts/lib/search.ts";

export const ENGINE_NAMES = ["promptus-lexical", "sqlite-fts5", "qmd-vector", "zvec-hybrid"] as const;
export type EngineName = typeof ENGINE_NAMES[number];
export interface WorkloadEngine {
  query(query: string): Promise<string[]>;
  update(sources: SearchSourceDocument[]): Promise<unknown>;
  indexedText(id: string): Promise<string | null>;
  close(): Promise<void>;
  storage(): number;
  workerRss(): number;
}
export const treeBytes = (path: string): number => !existsSync(path) ? 0 : statSync(path).isDirectory()
  ? readdirSync(path).reduce((sum, name) => sum + treeBytes(join(path, name)), 0) : statSync(path).size;

export async function openEngine(name: EngineName, scratch: string, dependencies: string): Promise<WorkloadEngine> {
  const data = join(scratch, "units");
  const noWorker = () => 0;
  if (name === "promptus-lexical") {
    const file = join(scratch, "search.json");
    let index: SearchIndex | undefined = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    return {
      query: async query => searchIndex(index!, query, {}, doc => readFileSync(join(data, `${doc.key}.md`), "utf8")).map(hit => hit.document.key),
      update: async sources => { index = buildSearchIndex(sources, "synthetic-workload"); writeFileSync(file, JSON.stringify(index)); return { indexed: sources.length }; },
      indexedText: async id => { const n = index!.documents.findIndex(doc => doc.key === id); return n < 0 ? null : Object.entries(index!.postings).filter(([, postings]) => postings.some(p => p[0] === n && p[1] > 0)).map(([term]) => term).join(" "); },
      close: async () => {}, storage: () => treeBytes(file), workerRss: noWorker,
    };
  }
  if (name === "sqlite-fts5") {
    const file = join(scratch, "fts.sqlite"), db = new Database(file);
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS units USING fts5(key UNINDEXED, title, path, body, tokenize='unicode61 remove_diacritics 2')");
    const insert = db.prepare("INSERT INTO units VALUES (?, ?, ?, ?)");
    const select = db.prepare("SELECT key FROM units WHERE units MATCH ? ORDER BY bm25(units,0,2.5,0.5,1) LIMIT 100");
    const scan = db.prepare("SELECT rowid, key, title, path, body FROM units");
    const remove = db.prepare("DELETE FROM units WHERE rowid=?");
    return {
      query: async query => {
        const match = [...new Set(searchTokens(query))].map(term => `"${term.replaceAll('"', '""')}"`).join(" OR ");
        return match ? (select.all(match) as { key: string }[]).map(row => row.key) : [];
      },
      update: async sources => {
        // Compare projected content, not just file mtimes. One transaction covers
        // deletion, changed rows and insertion; unchanged rows retain their rowid.
        const old = new Map((scan.all() as any[]).map(row => [row.key, row]));
        let changed = 0, deleted = 0;
        db.transaction(() => {
          for (const source of sources) {
            const row = old.get(source.id); old.delete(source.id);
            if (row && row.title === source.title && row.path === source.path && row.body === source.text) continue;
            if (row) remove.run(row.rowid);
            insert.run(source.id!, source.title, source.path, source.text); changed++;
          }
          for (const row of old.values()) { remove.run(row.rowid); deleted++; }
        })();
        return { changed, deleted };
      },
      indexedText: async id => {
        const statement = db.prepare("SELECT body FROM units WHERE key=?");
        try { return (statement.get(id) as { body: string } | null)?.body ?? null; }
        finally { statement.finalize(); }
      },
      close: async () => { for (const statement of [insert, select, scan, remove]) statement.finalize(); db.close(); }, storage: () => treeBytes(file) + treeBytes(`${file}-wal`), workerRss: noWorker,
    };
  }
  if (name === "zvec-hybrid") {
    const { createZvecGrep } = await import(pathToFileURL(join(dependencies, "node_modules/@zvec/zvec-grep/dist/index.js")).href);
    const store = await createZvecGrep({ root: data, home: join(scratch, "zg-state"), modelCacheDir: join(dependencies, "models"), embedding: "local/potion-retrieval-32m", device: "cpu" });
    return {
      query: async query => [...new Set<string>((await store.context({ query, limit: 100, autoUpdate: false })).items.map((hit: any) => basename(hit.file.relativePath, ".md")))],
      update: () => store.index(), close: () => store.close(),
      indexedText: async id => {
        // Pinned read-only inspection of stored entities, not a reread of the
        // source file (which would hide stale index content).
        const info = await store.info({ includeStatus: false });
        const { createWorkspaceIndexStorage } = await import(pathToFileURL(join(dependencies, "node_modules/@zvec/zvec-grep/dist/engine/storage/index.js")).href);
        const storage = createWorkspaceIndexStorage({ storagePath: info.workspaceIndex.path, readOnly: true });
        try { const file = storage.getFileByPath(join(data, `${id}.md`)); return file ? storage.listEntitiesByFile(file.id).map((entry: any) => entry.entity.content.text ?? "").join("\n") : null; }
        finally { storage.close(); }
      },
      storage: () => treeBytes(join(data, ".zvec-grep")) + treeBytes(join(scratch, "zg-state")), workerRss: noWorker,
    };
  }
  if (name !== "qmd-vector") throw new Error(`unknown engine: ${name}`);
  const file = join(scratch, "qmd.sqlite");
  const worker = spawn(join(dependencies, "node_modules/node-linux-x64/bin/node"), [join(import.meta.dir, "engine-workload-qmd.mjs")], {
    stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, QMD_FORCE_CPU: "1", XDG_CACHE_HOME: join(dependencies, "model-cache") },
  });
  let sequence = 0, fatal: Error | undefined, rss = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const fail = (error: Error) => { fatal = error; for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); } pending.clear(); };
  const lines = createInterface({ input: worker.stdout });
  lines.on("line", line => {
    try {
      const message = JSON.parse(line), waiter = pending.get(message.id); pending.delete(message.id);
      rss = Math.max(rss, message.rssBytes ?? 0);
      if (waiter) { clearTimeout(waiter.timer); message.error ? waiter.reject(new Error(message.error)) : waiter.resolve(message.result); }
    } catch { fail(new Error("invalid QMD worker response")); }
  });
  worker.on("error", fail); worker.on("exit", code => fail(new Error(`QMD worker exited ${code}`)));
  worker.stdin.on("error", fail); worker.stdout.on("error", fail);
  const send = (action: string, args = {}) => new Promise<any>((resolve, reject) => {
    if (fatal) return reject(fatal);
    const id = ++sequence;
    const timer = setTimeout(() => { fail(new Error(`QMD timed out: ${action}`)); worker.kill(); }, action === "update" ? 1_200_000 : 60_000);
    pending.set(id, { resolve, reject, timer });
    worker.stdin.write(JSON.stringify({ id, action, ...args }) + "\n", error => { if (error) fail(error); });
  });
  try { await send("open", { dependencies, corpus: data, dbPath: file, model: join(dependencies, "model-cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf") }); }
  catch (error) { lines.close(); worker.kill(); throw error; }
  return {
    query: async query => (await send("query", { query })).map((hit: any) => basename(hit.filepath, ".md")),
    update: () => send("update"),
    indexedText: id => send("body", { unitId: id }),
    close: async () => { try { if (!fatal) await send("close"); } finally { worker.stdin.end(); lines.close(); worker.kill(); } },
    storage: () => treeBytes(file) + treeBytes(`${file}-wal`), workerRss: () => rss,
  };
}
