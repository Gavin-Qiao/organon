import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { semanticSnapshot, semanticCandidates, semanticBase, semanticDatabase, updateSemantic, SEMANTIC_SCHEMA } from "../lib/semantic.ts";
import { hashStore } from "../lib/store-hash.ts";
const scripts = join(import.meta.dir, ".."), sha = (text: string) => createHash("sha256").update(text).digest("hex");

// Contract double: exercises the real worker/process/filesystem boundary without
// downloading QMD or a model in bun test. Real SDK runs are separate receipts.
const SDK = `import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,basename} from 'node:path';
export async function createStore({dbPath,config}) {
 let rows=existsSync(dbPath)?JSON.parse(readFileSync(dbPath,'utf8')):[];
 const save=()=>writeFileSync(dbPath,JSON.stringify(rows));
 return {listCollections:async()=>[],removeCollection:async()=>true,
 update:async()=>{rows=[];for(const [group,collection] of Object.entries(config.collections))for(const file of readdirSync(collection.path).filter(f=>f.endsWith('.md')))rows.push({filepath:'qmd://'+group+'/'+file,group,text:readFileSync(join(collection.path,file),'utf8')});save();return {files:rows.length};},
 embed:async()=>{const fault=join(import.meta.dirname,'fault.json');if(existsSync(fault)){const f=JSON.parse(readFileSync(fault,'utf8'));if(f.path)writeFileSync(f.path,f.text);if(f.fail)throw Error('controlled embedding failure');}return {errors:0};},
 searchVector:async(q,o)=>{const fault=join(import.meta.dirname,'fault.json');const f=existsSync(fault)?JSON.parse(readFileSync(fault,'utf8')):{};if(f.queryPath)writeFileSync(f.queryPath,f.text);return rows.filter(r=>o.collection.includes(r.group)).sort((a,b)=>Number(b.text.toLowerCase().includes(q.toLowerCase()))-Number(a.text.toLowerCase().includes(q.toLowerCase()))).slice(0,o.limit).map(r=>({filepath:f.wrongURI?r.filepath.replace(r.group,'wrong-collection'):r.filepath,score:1}));}, close:async()=>{}};
}`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "promptus-semantic-test-"));
  for (const dir of ["docs", "schema", "ledger", "memory"]) mkdirSync(join(root, ".promptus", dir), { recursive: true });
  copyFileSync(join(scripts, "../templates/schema/kb-vocab.json"), join(root, ".promptus/schema/kb-vocab.json"));
  writeFileSync(join(root, ".promptus/TELOS.md"), "# Synthetic semantic fixture\n");
  const base = semanticBase(root, true), packageRoot = join(root, "mock-qmd"), model = join(root, "mock.gguf");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@tobilu/qmd", version: "2.8.3", type: "module" }));
  writeFileSync(join(packageRoot, "dist/index.js"), SDK); writeFileSync(model, "test model");
  const config = { schema: SEMANTIC_SCHEMA, packageRoot, node: process.execPath, model, modelSha256: sha("test model") };
  writeFileSync(join(base, "config.json"), JSON.stringify(config));
  return { root, base, config, page: (name: string, status = "VALIDATED", extra = "", body = name) => {
    const path = join(root, ".promptus/docs", `${name}.md`);
    writeFileSync(path, `---\nid: finding-20260101T000000Z-${name}\nsubstrate: finding\nkind: CLAIM\nstatus: ${status}\n${extra}---\n# ${name}\n\n${body}\n`); return path;
  } };
}
const find = (root: string, ...args: string[]) => spawnSync(process.execPath, [join(scripts, "kb-find.ts"), "--root", root, ...args], { encoding: "utf8", timeout: 15_000 });

test("semantic worker preserves identity, lifecycle, filters and source bytes", () => {
  const f = fixture();
  try {
    f.page("old"); f.page("current", "VALIDATED", "relations: [supersedes:finding-20260101T000000Z-old]\n", "the accepted coefficient"); f.page("rejected", "REFUTED");
    const before = hashStore(f.root), snapshot = semanticSnapshot(f.root);
    expect(snapshot.documents.find(d => d.title === "old")?.status).toBe("SUPERSEDED");
    expect(updateSemantic(f.root).unchanged).toBe(false);
    expect(updateSemantic(f.root).unchanged).toBe(true);
    expect(semanticCandidates(f.root, snapshot, "coefficient", { limit: 10 }).map(d => d.title)).toEqual(["current"]);
    expect(semanticCandidates(f.root, snapshot, "old", { status: "SUPERSEDED", limit: 10 }).map(d => d.title)).toEqual(["old"]);
    const result = find(f.root, "--semantic", "coefficient", "--limit", "1");
    expect(result.status).toBe(0); expect(result.stdout).toContain("route:qmd"); expect(result.stdout).toContain("current.md");
    expect(hashStore(f.root)).toEqual(before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("stale source falls back to fresh lexical content without reusing old statuses", () => {
  const f = fixture();
  try {
    f.page("old"); updateSemantic(f.root);
    f.page("current", "VALIDATED", "relations: [supersedes:finding-20260101T000000Z-old]\n", "replacementword");
    const result = find(f.root, "replacementword", "--semantic");
    expect(result.status).toBe(0); expect(result.stderr).toContain("stale"); expect(result.stdout).toContain("current.md"); expect(result.stdout).toContain("lexical-fallback");
    updateSemantic(f.root);
    expect(semanticCandidates(f.root, semanticSnapshot(f.root), "old", { limit: 10 }).map(d => d.title)).not.toContain("old");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("exact controls bypass the model, boolean flags preserve following queries, and invalid flags fail", () => {
  const f = fixture();
  try {
    f.page("one", "VALIDATED", "", "precise needle"); f.page("two", "VALIDATED", "", "precise other");
    for (const args of [["--semantic", '"precise needle"'], ["--semantic", "+needle"], ["--semantic", "--all", "precise needle"]]) {
      const r = find(f.root, ...args); expect(r.status).toBe(0); expect(r.stdout).toContain("one.md"); expect(r.stdout).not.toContain("two.md"); expect(r.stderr).toContain("bypassed");
    }
    expect(find(f.root, "--semantci").status).toBe(1); expect(find(f.root, "--hops", "Infinity").status).toBe(1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("graph expansion respects status filters even when neighbours are linked", () => {
  const f = fixture();
  try {
    f.page("current", "VALIDATED", "links: [rejected]\n", "acceptance"); f.page("rejected", "REFUTED"); updateSemantic(f.root);
    const r = find(f.root, "acceptance", "--semantic", "--status", "VALIDATED", "--hops", "1");
    expect(r.status).toBe(0); expect(r.stdout).toContain("current.md"); expect(r.stdout).not.toContain("rejected.md");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("failed or source-racing refresh never publishes a usable receipt", () => {
  const f = fixture();
  try {
    const page = f.page("one"); updateSemantic(f.root); f.page("two");
    const fault = join(f.config.packageRoot, "dist/fault.json"); writeFileSync(fault, JSON.stringify({ fail: true }));
    expect(() => updateSemantic(f.root)).toThrow("controlled embedding failure"); expect(existsSync(join(f.base, "receipt.json"))).toBe(false);
    writeFileSync(fault, JSON.stringify({ path: page, text: readFileSync(page, "utf8") + "\nnew source version\n" }));
    expect(() => updateSemantic(f.root)).toThrow("source changed"); expect(existsSync(join(f.base, "receipt.json"))).toBe(false);
    unlinkSync(fault); expect(updateSemantic(f.root).unchanged).toBe(false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("database replacement fails closed and update rebuilds it", () => {
  const f = fixture();
  try {
    f.page("one"); updateSemantic(f.root); const db = semanticDatabase(f.base, f.config);
    writeFileSync(db, "[]");
    expect(() => semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toThrow("database");
    expect(updateSemantic(f.root).unchanged).toBe(false);
    expect(semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toHaveLength(1);
    writeFileSync(join(f.base, "receipt.json"), "{truncated");
    expect(updateSemantic(f.root).unchanged).toBe(false);
    expect(semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toHaveLength(1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("model bytes are bound and a changed model uses a separate database generation", () => {
  const f = fixture();
  try {
    f.page("one"); updateSemantic(f.root); const oldDb = semanticDatabase(f.base, f.config);
    writeFileSync(f.config.model, "different model");
    expect(() => semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toThrow("model changed");
    f.config.modelSha256 = sha("different model"); writeFileSync(join(f.base, "config.json"), JSON.stringify(f.config));
    expect(semanticDatabase(f.base, f.config)).not.toBe(oldDb); expect(updateSemantic(f.root).unchanged).toBe(false);
    expect(existsSync(oldDb)).toBe(true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("dangling projection symlinks are rejected before creating their outside target", () => {
  const f = fixture();
  try {
    f.page("one"); const doc = semanticSnapshot(f.root).documents[0];
    const dir = join(f.base, "units", doc.group); mkdirSync(dir, { recursive: true });
    const outside = join(f.root, "outside.md");
    try { symlinkSync(outside, join(dir, doc.file)); } catch (error: any) { if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) return; throw error; }
    expect(() => updateSemantic(f.root)).toThrow("symlink"); expect(existsSync(outside)).toBe(false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("hard-linked projections fail before altering canonical source bytes", () => {
  const f = fixture();
  try {
    const page = f.page("one"), before = hashStore(f.root), doc = semanticSnapshot(f.root).documents[0];
    const dir = join(f.base, "units", doc.group); mkdirSync(dir, { recursive: true });
    linkSync(page, join(dir, doc.file));
    expect(() => updateSemantic(f.root)).toThrow("hard-linked");
    expect(hashStore(f.root)).toEqual(before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("unexpected provider URI is rejected rather than relabeled as canonical evidence", () => {
  const f = fixture();
  try {
    f.page("one"); updateSemantic(f.root);
    writeFileSync(join(f.config.packageRoot, "dist/fault.json"), JSON.stringify({ wrongURI: true }));
    expect(() => semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toThrow("unexpected unit identifier");
    const r = find(f.root, "one", "--semantic");
    expect(r.status).toBe(0); expect(r.stdout).toContain("lexical-fallback"); expect(r.stderr).toContain("unexpected unit identifier");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("interrupted SQLite sidecars and unreceipted partial databases are rebuilt", () => {
  const f = fixture();
  try {
    f.page("one"); updateSemantic(f.root); const db = semanticDatabase(f.base, f.config);
    writeFileSync(db + "-wal", "unverified transaction");
    expect(() => semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toThrow("sidecar");
    expect(updateSemantic(f.root).unchanged).toBe(false); expect(existsSync(db + "-wal")).toBe(false);
    unlinkSync(join(f.base, "receipt.json")); writeFileSync(db, "partial invalid database");
    expect(updateSemantic(f.root).unchanged).toBe(false);
    expect(semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toHaveLength(1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("model replacement during worker execution cannot publish a receipt or result", () => {
  const f = fixture();
  try {
    f.page("one"); const fault = join(f.config.packageRoot, "dist/fault.json");
    writeFileSync(fault, JSON.stringify({ path: f.config.model, text: "racing model" }));
    expect(() => updateSemantic(f.root)).toThrow("model changed during refresh");
    expect(existsSync(join(f.base, "receipt.json"))).toBe(false);
    unlinkSync(fault); writeFileSync(f.config.model, "test model"); updateSemantic(f.root);
    writeFileSync(fault, JSON.stringify({ queryPath: f.config.model, text: "query-racing model" }));
    expect(() => semanticCandidates(f.root, semanticSnapshot(f.root), "one", { limit: 10 })).toThrow("model changed during query");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("archive movement, deletion and restart preserve scope and remove obsolete projections", () => {
  const f = fixture();
  try {
    const page = f.page("archived", "VALIDATED", "", "uniquearchiveword"), removed = f.page("removed"); updateSemantic(f.root);
    const old = semanticSnapshot(f.root).documents;
    const archive = join(f.root, ".promptus/docs/archive"); mkdirSync(archive);
    renameSync(page, join(archive, "archived.md")); unlinkSync(removed);
    expect(find(f.root, "uniquearchiveword", "--semantic", "--history").stderr).toContain("stale");
    updateSemantic(f.root);
    expect(semanticCandidates(f.root, semanticSnapshot(f.root), "uniquearchiveword", { limit: 10 })).toHaveLength(0);
    const r = find(f.root, "uniquearchiveword", "--semantic", "--history");
    expect(r.status).toBe(0); expect(r.stdout).toContain("route:qmd"); expect(r.stdout).toContain("docs/archive/archived.md");
    for (const doc of old) expect(existsSync(join(f.base, "units", doc.group, doc.file))).toBe(false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
