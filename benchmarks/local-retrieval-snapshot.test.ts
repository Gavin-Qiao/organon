import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capture, assertSnapshot, manifest } from "./local-retrieval-snapshot.ts";
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),"organon-snapshot-test-"));mkdirSync(join(root,".promptus"));writeFileSync(join(root,".promptus/TELOS.md"),"# Synthetic direction\n");return root;};
test("source-only capture preserves bytes, excludes cache and rejects drift",()=>{
  const root=fixture();mkdirSync(join(root,".promptus/cache"));writeFileSync(join(root,".promptus/cache/private-index"),"derived");
  const source=manifest(root),result=capture(root,"test");expect(result.verified).toBe(true);expect(result.files).toBe(1);expect(assertSnapshot(result.root).manifestHash).toBe(result.manifestHash);expect(manifest(root)).toEqual(source);
  writeFileSync(join(result.root,".promptus/TELOS.md"),"changed copy");expect(()=>assertSnapshot(result.root)).toThrow("drift");expect(readFileSync(join(root,".promptus/TELOS.md"),"utf8")).toBe("# Synthetic direction\n");
});
test("links and unmarked roots fail closed",()=>{
  const root=fixture();expect(()=>assertSnapshot(root)).toThrow();symlinkSync(join(root,".promptus/TELOS.md"),join(root,".promptus/linked.md"));expect(()=>capture(root,"unsafe")).toThrow("unsafe source");
});
