import { test,expect } from "bun:test";
import { mkdtempSync,mkdirSync,writeFileSync,realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertQuality,corpus,QUALITY_MARKER } from "./quality-sources.ts";
import { digest } from "./local-retrieval-snapshot.ts";
test("private quality corpus is marker-bound, project-bounded and hash-verified",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"organon-quality-test-")));
 expect(()=>assertQuality(root)).toThrow();writeFileSync(join(root,"marker"),QUALITY_MARKER);expect(assertQuality(root)).toBe(root);
 mkdirSync(join(root,"psi"));const bytes=JSON.stringify([{key:"synthetic",text:"synthetic evidence"}]);
 writeFileSync(join(root,"psi/corpus.json"),bytes);writeFileSync(join(root,"psi/manifest.json"),JSON.stringify({corpusHash:digest(bytes)}));
 expect(corpus(root,"psi")).toEqual(JSON.parse(bytes));expect(()=>corpus(root,"../psi")).toThrow();
 writeFileSync(join(root,"psi/corpus.json"),"[]");expect(()=>corpus(root,"psi")).toThrow("corpus drift");
});
