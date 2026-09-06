/** Private, source-only capture for local retrieval experiments. Never follows links. */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
export const SNAPSHOT_MARKER = "organon.private-retrieval-snapshot.v1";
export const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export function manifest(root: string): Array<{ path: string; bytes: number; sha256: string }> {
  const base = join(root, ".promptus"), result: Array<{ path: string; bytes: number; sha256: string }> = [];
  const walk = (dir: string, prefix: string) => {
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error("source directory is not physical");
    for (const name of readdirSync(dir).sort()) {
      if (["cache", ".git", ".locks"].includes(name)) continue;
      const path = join(dir, name), rel = prefix + name, stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("unsafe source entry");
      if (stat.isDirectory()) walk(path, rel + "/");
      else { const bytes = readFileSync(path); result.push({ path: rel, bytes: bytes.length, sha256: digest(bytes) }); }
    }
  };
  walk(base, ""); return result;
}
export function assertSnapshot(root: string) {
  const path = realpathSync(root), temp = realpathSync(tmpdir());
  const rel = relative(temp, path);
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes("..") || lstatSync(root).isSymbolicLink()) throw new Error("snapshot must be a physical OS-temp directory");
  const receipt = JSON.parse(readFileSync(join(path, "snapshot.json"), "utf8"));
  if (receipt.schema !== SNAPSHOT_MARKER || receipt.root !== path || !receipt.verified) throw new Error("unverified snapshot");
  if (digest(JSON.stringify(manifest(path))) !== receipt.manifestHash) throw new Error("snapshot source drift");
  return receipt;
}
export function capture(sourceInput: string, label: string) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error("invalid label");
  const source = realpathSync(resolve(sourceInput));
  if (!existsSync(join(source, ".promptus/TELOS.md"))) throw new Error("missing Telos");
  const root = realpathSync(mkdtempSync(join(tmpdir(), `organon-private-${label}-`)));
  const started = new Date().toISOString(), before = manifest(source);
  for (const file of before) {
    const target = join(root, ".promptus", file.path);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(join(source, ".promptus", file.path), target);
  }
  const after = manifest(source), copied = manifest(root), manifestHash = digest(JSON.stringify(before));
  const verified = [after, copied].every(value => digest(JSON.stringify(value)) === manifestHash);
  const receipt = { schema: SNAPSHOT_MARKER, root, source, label, started, completed: new Date().toISOString(), manifestHash, verified, files: before.length, bytes: before.reduce((s, f) => s + f.bytes, 0), manifest: before, excluded: ["cache", ".git", ".locks"], artifactScope: "No external artifacts copied; this is not a whole-project integrity fixture." };
  writeFileSync(join(root, "snapshot.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (!verified) throw new Error(`source changed during capture; rejected snapshot retained at ${root}`);
  return { root, label, started, completed: receipt.completed, manifestHash, verified, files: receipt.files, bytes: receipt.bytes };
}
if (import.meta.main) {
  const [source, label] = process.argv.slice(2);
  if (!source || !label || process.argv.length !== 4) throw new Error("usage: local-retrieval-snapshot.ts SOURCE LABEL");
  console.log(JSON.stringify(capture(source, label)));
}
